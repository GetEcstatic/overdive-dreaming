import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { defineSecret } from 'firebase-functions/params';
import { byteRanges } from '../../src/lib/media/byteRanges';

export const WASABI_ACCESS_KEY_ID = defineSecret('WASABI_ACCESS_KEY_ID');
export const WASABI_SECRET_ACCESS_KEY = defineSecret('WASABI_SECRET_ACCESS_KEY');

const DEFAULT_REGION = 'ap-southeast-1';
const DEFAULT_ENDPOINT = 'https://s3.ap-southeast-1.wasabisys.com';
const DEFAULT_PROD_BUCKET = 'overdive-media-prod';
const DEFAULT_DEV_BUCKET = 'overdive-media-dev';

let cachedClient: S3Client | null = null;

export interface WasabiConfig {
	region: string;
	endpoint: string;
	prodBucket: string;
	devBucket: string;
	bucket: string;
}

export function getWasabiConfig(): WasabiConfig {
	const region = process.env.WASABI_REGION || DEFAULT_REGION;
	const endpoint = process.env.WASABI_ENDPOINT || DEFAULT_ENDPOINT;
	const prodBucket = process.env.WASABI_BUCKET_PROD || process.env.WASABI_BUCKET || DEFAULT_PROD_BUCKET;
	const devBucket = process.env.WASABI_BUCKET_DEV || DEFAULT_DEV_BUCKET;
	const bucket = process.env.WASABI_ENV === 'dev' ? devBucket : prodBucket;
	return { region, endpoint, prodBucket, devBucket, bucket };
}

export function getWasabiClient(): S3Client {
	if (cachedClient) return cachedClient;
	const config = getWasabiConfig();
	cachedClient = new S3Client({
		region: config.region,
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: WASABI_ACCESS_KEY_ID.value(),
			secretAccessKey: WASABI_SECRET_ACCESS_KEY.value()
		},
		forcePathStyle: false
	});
	return cachedClient;
}

export async function signPutObject(args: {
	bucket: string;
	key: string;
	contentType: string;
	expiresInSeconds: number;
}): Promise<string> {
	return getSignedUrl(
		getWasabiClient(),
		new PutObjectCommand({
			Bucket: args.bucket,
			Key: args.key,
			ContentType: args.contentType
		}),
		{ expiresIn: args.expiresInSeconds }
	);
}

export async function signGetObject(args: {
	bucket: string;
	key: string;
	expiresInSeconds: number;
	responseContentDisposition?: string;
	responseContentType?: string;
}): Promise<string> {
	return getSignedUrl(
		getWasabiClient(),
		new GetObjectCommand({
			Bucket: args.bucket,
			Key: args.key,
			ResponseContentDisposition: args.responseContentDisposition,
			ResponseContentType: args.responseContentType
		}),
		{ expiresIn: args.expiresInSeconds }
	);
}

export async function deleteObject(args: { bucket: string; key: string }): Promise<void> {
	await getWasabiClient().send(new DeleteObjectCommand({ Bucket: args.bucket, Key: args.key }));
}

export async function getObjectBytes(args: { bucket: string; key: string }): Promise<Uint8Array> {
	const result = await getWasabiClient().send(
		new GetObjectCommand({ Bucket: args.bucket, Key: args.key })
	);
	if (!result.Body) throw new Error('Wasabi object response had no body');
	if ('transformToByteArray' in result.Body) {
		return result.Body.transformToByteArray();
	}
	const chunks: Buffer[] = [];
	for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

/** Ranged download parts. 16 × 16 MB in flight; each part streams to its file offset. */
const DOWNLOAD_PART_BYTES = 16 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 16;
const DOWNLOAD_PART_ATTEMPTS = 3;

/**
 * Stream an object straight to a file. Never holds the object in memory: on
 * Cloud Run /tmp is itself memory, so buffering a 1 GB 4K original as well
 * doubled its footprint and ran the 4 GiB worker out of memory. Large objects
 * download as parallel ranged GETs: the bucket is in Singapore and the worker
 * in the US, where one connection managed only ~9 MB/s.
 */
export async function downloadObjectToFile(
	args: { bucket: string; key: string },
	path: string,
	onProgress?: (fraction: number) => void
): Promise<{ sizeBytes: number }> {
	const client = getWasabiClient();
	const head = await client.send(new HeadObjectCommand({ Bucket: args.bucket, Key: args.key }));
	const totalBytes = Number(head.ContentLength ?? 0);
	if (!(totalBytes > DOWNLOAD_PART_BYTES * 2)) {
		const result = await client.send(new GetObjectCommand({ Bucket: args.bucket, Key: args.key }));
		if (!result.Body) throw new Error('Wasabi object response had no body');
		await pipeline(result.Body as Readable, createWriteStream(path));
		onProgress?.(1);
		return { sizeBytes: totalBytes };
	}
	const ranges = byteRanges(totalBytes, DOWNLOAD_PART_BYTES);
	const handle = await open(path, 'w');
	let next = 0;
	let doneBytes = 0;
	const downloadPart = async (range: { start: number; end: number }) => {
		for (let attempt = 1; ; attempt += 1) {
			let written = 0;
			try {
				const result = await client.send(
					new GetObjectCommand({ Bucket: args.bucket, Key: args.key, Range: `bytes=${range.start}-${range.end}` })
				);
				if (!result.Body) throw new Error('Wasabi range response had no body');
				for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
					await handle.write(chunk, 0, chunk.byteLength, range.start + written);
					written += chunk.byteLength;
					doneBytes += chunk.byteLength;
					onProgress?.(doneBytes / totalBytes);
				}
				if (written !== range.end - range.start + 1) throw new Error(`Short ranged read at byte ${range.start}`);
				return;
			} catch (err) {
				doneBytes -= written;
				if (attempt >= DOWNLOAD_PART_ATTEMPTS) throw err;
			}
		}
	};
	try {
		await Promise.all(
			Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, ranges.length) }, async () => {
				while (next < ranges.length) {
					const range = ranges[next];
					next += 1;
					await downloadPart(range);
				}
			})
		);
	} finally {
		await handle.close();
	}
	return { sizeBytes: totalBytes };
}

export async function putObjectBytes(args: {
	bucket: string;
	key: string;
	body: Uint8Array;
	contentType: string;
}): Promise<void> {
	await getWasabiClient().send(
		new PutObjectCommand({
			Bucket: args.bucket,
			Key: args.key,
			Body: args.body,
			ContentType: args.contentType
		})
	);
}

export async function createMultipartUpload(args: {
	bucket: string;
	key: string;
	contentType: string;
}): Promise<string> {
	const result = await getWasabiClient().send(
		new CreateMultipartUploadCommand({
			Bucket: args.bucket,
			Key: args.key,
			ContentType: args.contentType
		})
	);
	if (!result.UploadId) throw new Error('Wasabi did not return a multipart upload id');
	return result.UploadId;
}

export async function signUploadPart(args: {
	bucket: string;
	key: string;
	uploadId: string;
	partNumber: number;
	expiresInSeconds: number;
}): Promise<string> {
	return getSignedUrl(
		getWasabiClient(),
		new UploadPartCommand({
			Bucket: args.bucket,
			Key: args.key,
			UploadId: args.uploadId,
			PartNumber: args.partNumber
		}),
		{ expiresIn: args.expiresInSeconds }
	);
}

export async function completeMultipartUpload(args: {
	bucket: string;
	key: string;
	uploadId: string;
	parts: Array<{ partNumber: number; etag: string }>;
}): Promise<void> {
	await getWasabiClient().send(
		new CompleteMultipartUploadCommand({
			Bucket: args.bucket,
			Key: args.key,
			UploadId: args.uploadId,
			MultipartUpload: {
				Parts: args.parts
					.slice()
					.sort((a, b) => a.partNumber - b.partNumber)
					.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag }))
			}
		})
	);
}

export async function abortMultipartUpload(args: {
	bucket: string;
	key: string;
	uploadId: string;
}): Promise<void> {
	await getWasabiClient().send(
		new AbortMultipartUploadCommand({
			Bucket: args.bucket,
			Key: args.key,
			UploadId: args.uploadId
		})
	);
}
