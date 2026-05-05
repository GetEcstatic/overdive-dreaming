import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { defineSecret } from 'firebase-functions/params';

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
