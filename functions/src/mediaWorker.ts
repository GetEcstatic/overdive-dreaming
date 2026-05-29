import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
	getObjectBytes,
	putObjectBytes,
	WASABI_ACCESS_KEY_ID,
	WASABI_SECRET_ACCESS_KEY
} from './wasabiClient.js';
import type { DiveVideoProcessingJob } from './mediaProcessingJobs.js';
import type { DiveTimeline } from './lib/timelineToRoutineLog.js';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static') as string | null;
const ffprobeStatic = require('ffprobe-static') as { path?: string };
const execFileAsync = promisify(execFile);
const OVERLAY_STYLE_VERSION = 'overdive-overlay-v9';
const OVERLAY_REQUEST_LOCK_STALE_MS = 10 * 60 * 1000;

const HUD_REFERENCE_SHORT_EDGE_PX = 390;
const CSS_PX_PER_REM = 16;
const SPEED_PLOT_REFERENCE_WIDTH_PX = 1080;
const SPEED_PLOT_DEFAULT_DOMAIN_M = 200;
const SPEED_PLOT_DOMAIN_PADDING_RATIO = 1.2;
const SPEED_PLOT_MAX_SPEED_MS = 2;
const SPEED_PLOT_FIRST_ACCELERATION_M = 3;

function rem(value: number): number {
	return value * CSS_PX_PER_REM;
}

function scaledCssPx(value: number, scale: number): number {
	return Math.round(value * scale);
}

interface MediaObjectRef {
	provider?: 'wasabi';
	bucket?: string;
	key: string;
	contentType?: string;
	sizeBytes?: number;
}

interface MediaProcessingJobDoc {
	videoId: string;
	ownerId: string;
	type: DiveVideoProcessingJob;
	status: 'queued' | 'processing' | 'ready' | 'failed' | 'retryable';
	attempts?: number;
	claimedAt?: FirebaseFirestore.Timestamp;
}

interface OverlayRequestLockDoc {
	jobId?: string;
	status?: 'queued' | 'processing' | 'ready' | 'failed' | 'retryable';
	updatedAt?: FirebaseFirestore.Timestamp;
}

interface DiveVideoDoc {
	ownerId?: string;
	userId?: string;
	storagePathClean?: string;
	cleanObject?: MediaObjectRef;
	artifacts?: DiveVideoArtifactRef[];
	storageProvider?: 'wasabi' | 'firebase-storage';
	mimeType?: string;
	sizeBytes?: number;
	actualAverageBitrateBps?: number;
	probeAudioCodec?: string;
	widthPx?: number;
	heightPx?: number;
	durationSeconds?: number;
	actualFrameRate?: number;
	discipline?: 'DYN' | 'DYNB' | 'DNF';
	poolLength?: number;
	timeline?: DiveTimeline;
	overlayStyleVersion?: string;
	displayOrientation?: 'landscape' | 'portrait-left' | 'portrait-right';
	displayRotationDeg?: 0 | 90 | 180 | 270;
	assetOrientation?: 'landscape' | 'portrait';
	probeRotationDeg?: 0 | 90 | 180 | 270;
}

interface DiveVideoArtifactRef {
	kind: 'master' | 'thumbnail' | 'playback-proxy' | 'overlay-preview' | 'overlay-download' | 'hls-manifest';
	profile: 'original' | 'thumb-jpeg' | 'mp4-720p' | 'mp4-1080p' | 'hls-adaptive' | 'overlay-mp4-540p' | 'overlay-mp4-720p' | 'overlay-mp4-1080p';
	object: MediaObjectRef;
	widthPx?: number;
	heightPx?: number;
	durationSeconds?: number;
	sizeBytes?: number;
	contentType?: string;
	styleVersion?: string;
	disposable?: boolean;
	expiresAt?: FirebaseFirestore.Timestamp;
	createdAt?: FirebaseFirestore.Timestamp;
}

interface ProbeSideData {
	rotation?: number;
}

interface ProbeStream {
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	r_frame_rate?: string;
	avg_frame_rate?: string;
	tags?: {
		rotate?: string;
	};
	side_data_list?: ProbeSideData[];
}

interface ProbeOutput {
	streams?: ProbeStream[];
	format?: {
		duration?: string;
		size?: string;
		format_name?: string;
	};
}

function requireUid(auth?: { uid: string }): string {
	if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required');
	return auth.uid;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new HttpsError('invalid-argument', 'Expected an object payload');
	}
	return value as Record<string, unknown>;
}

function requiredString(data: Record<string, unknown>, key: string): string {
	const value = data[key];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new HttpsError('invalid-argument', `Missing ${key}`);
	}
	return value.trim();
}

function stateKeyFor(type: DiveVideoProcessingJob): string | null {
	if (type === 'probe-master') return 'master';
	if (type === 'generate-thumbnail') return 'thumbnail';
	if (type === 'generate-playback-proxy') return 'playbackProxy';
	if (type === 'generate-overlay-preview') return 'overlayPreview';
	if (type === 'generate-overlay-download') return 'overlayDownload';
	return null;
}

function isImplementedAutomaticJob(type: DiveVideoProcessingJob): boolean {
	return (
		type === 'probe-master' ||
		type === 'generate-thumbnail' ||
		type === 'generate-playback-proxy' ||
		type === 'generate-overlay-download'
	);
}

function isStaleProcessingJob(job: MediaProcessingJobDoc, nowMs = Date.now()): boolean {
	const claimedAt = job.claimedAt;
	if (!claimedAt || typeof claimedAt.toMillis !== 'function') return false;
	return nowMs - claimedAt.toMillis() > 15 * 60 * 1000;
}

function frameRate(value: string | undefined): number | undefined {
	if (!value || value === '0/0') return undefined;
	const [numeratorRaw, denominatorRaw] = value.split('/');
	const numerator = Number(numeratorRaw);
	const denominator = Number(denominatorRaw ?? '1');
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
		return undefined;
	}
	return numerator / denominator;
}

function normalizedRotation(value: number | undefined): 0 | 90 | 180 | 270 | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	const normalized = ((Math.round(value) % 360) + 360) % 360;
	if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
		return normalized;
	}
	return undefined;
}

function streamRotation(stream: ProbeStream | undefined): 0 | 90 | 180 | 270 | undefined {
	if (!stream) return undefined;
	const tagRotation = Number(stream.tags?.rotate);
	const sideDataRotation = stream.side_data_list
		?.map((sideData) => normalizedRotation(sideData.rotation))
		.find((rotation) => rotation !== undefined);
	return normalizedRotation(tagRotation) ?? sideDataRotation;
}

function withoutUndefined(fields: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined)
	);
}

function formatAssTime(seconds: number): string {
	const clamped = Math.max(0, seconds);
	const hours = Math.floor(clamped / 3600);
	const minutes = Math.floor((clamped % 3600) / 60);
	const secs = Math.floor(clamped % 60);
	const centiseconds = Math.floor((clamped % 1) * 100);
	return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
		.toString()
		.padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

function escapeAssText(value: string): string {
	return value.replace(/[{}]/g, '').replace(/\r?\n/g, ' ');
}

function escapeXmlText(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatHudTime(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
	const secs = (seconds % 60).toString().padStart(2, '0');
	const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
	return `${minutes}:${secs}.${tenths}`;
}

function even(value: number): number {
	const rounded = Math.max(2, Math.round(value));
	return rounded % 2 === 0 ? rounded : rounded - 1;
}

function displayRotationDeg(video: DiveVideoDoc): 0 | 90 | 180 | 270 {
	if (video.displayOrientation === 'portrait-left') return video.displayRotationDeg ?? 90;
	if (video.displayOrientation === 'portrait-right') return video.displayRotationDeg ?? 270;
	return 0;
}

function displayRotationFilters(video: DiveVideoDoc): string[] {
	const rotation = displayRotationDeg(video);
	if (rotation === 90) return ['transpose=1'];
	if (rotation === 270) return ['transpose=2'];
	if (rotation === 180) return ['hflip', 'vflip'];
	return [];
}

function rotatedDimensions(video: DiveVideoDoc): { width: number; height: number } {
	const sourceWidth = video.widthPx && video.widthPx > 0 ? video.widthPx : 1280;
	const sourceHeight = video.heightPx && video.heightPx > 0 ? video.heightPx : 720;
	const rotation = displayRotationDeg(video);
	if (rotation === 90 || rotation === 270) {
		return { width: sourceHeight, height: sourceWidth };
	}
	return { width: sourceWidth, height: sourceHeight };
}

function displayDimensions(video: DiveVideoDoc): { width: number; height: number } {
	const dimensions = rotatedDimensions(video);
	const shouldDisplayPortrait =
		video.displayOrientation === 'portrait-left' || video.displayOrientation === 'portrait-right';
	if (shouldDisplayPortrait && dimensions.width > dimensions.height) {
		return { width: dimensions.height, height: dimensions.width };
	}
	if (!shouldDisplayPortrait && dimensions.height > dimensions.width) {
		return { width: dimensions.height, height: dimensions.width };
	}
	return dimensions;
}

function scaledDimensions(dimensions: { width: number; height: number }, maxEdge = 1280): {
	width: number;
	height: number;
} {
	const ratio = Math.min(1, maxEdge / Math.max(dimensions.width, dimensions.height));
	return {
		width: even(dimensions.width * ratio),
		height: even(dimensions.height * ratio)
	};
}

function overlayExportProfile(video: DiveVideoDoc): {
	maxEdge: 540 | 720 | 1080;
	profile: 'overlay-mp4-540p' | 'overlay-mp4-720p' | 'overlay-mp4-1080p';
} {
	const sizeBytes = video.cleanObject?.sizeBytes ?? video.sizeBytes ?? 0;
	const durationSeconds = video.durationSeconds ?? 0;
	const inferredBitrateBps =
		sizeBytes > 0 && durationSeconds > 0 ? (sizeBytes * 8) / durationSeconds : undefined;
	const bitrateBps = video.actualAverageBitrateBps ?? inferredBitrateBps ?? 0;
	const codecDescription = `${video.mimeType ?? ''} ${video.cleanObject?.contentType ?? ''} ${
		video.probeAudioCodec ?? ''
	}`.toLowerCase();
	const suspectCodec = codecDescription.includes('opus');
	if (suspectCodec) return { maxEdge: 540, profile: 'overlay-mp4-540p' };
	if (sizeBytes > 250 * 1024 * 1024 || durationSeconds > 180 || bitrateBps > 12_000_000) {
		return { maxEdge: 720, profile: 'overlay-mp4-720p' };
	}
	return { maxEdge: 1080, profile: 'overlay-mp4-1080p' };
}

function diveElapsedAt(timeline: DiveTimeline, atMs: number): number {
	if (atMs <= timeline.diveStartMs) return 0;
	const end = timeline.diveEndMs > 0 ? timeline.diveEndMs : atMs;
	return Math.max(0, Math.min(atMs, end) - timeline.diveStartMs);
}

function sortedWaypointEvents(timeline: DiveTimeline) {
	return [...timeline.laps, ...(timeline.subSplits ?? [])]
		.filter((event) => event.atMs >= timeline.diveStartMs && event.atMs <= timeline.diveEndMs)
		.sort((a, b) => a.atMs - b.atMs || a.cumulativeDistanceM - b.cumulativeDistanceM);
}

function segmentSpeedMs(previous: { atMs: number; cumulativeDistanceM: number } | null, next: { atMs: number; cumulativeDistanceM: number }, timeline: DiveTimeline): number {
	const previousAtMs = previous?.atMs ?? timeline.diveStartMs;
	const previousDistanceM = previous?.cumulativeDistanceM ?? 0;
	const segmentMs = Math.max(0, next.atMs - previousAtMs);
	const segmentDistanceM = Math.max(0, next.cumulativeDistanceM - previousDistanceM);
	return segmentMs > 0 ? segmentDistanceM / (segmentMs / 1000) : 1;
}

function distanceAt(timeline: DiveTimeline, atMs: number, poolLength: number): number {
	void poolLength;
	const samples = timeline.samples;
	if (samples && samples.length > 0) {
		const before = [...samples].reverse().find((sample) => sample.atMs <= atMs);
		const after = samples.find((sample) => sample.atMs >= atMs);
		if (!before) {
			if (atMs <= timeline.diveStartMs) return 0;
			const first = samples[0];
			const effectiveAtMs = Math.min(atMs, first.atMs);
			return ((effectiveAtMs - timeline.diveStartMs) / 1000) * first.speedMs;
		}
		if (!after || after.atMs === before.atMs) return before.distanceM;
		const progress = (atMs - before.atMs) / (after.atMs - before.atMs);
		return before.distanceM + (after.distanceM - before.distanceM) * progress;
	}

	if (atMs <= timeline.diveStartMs) return 0;
	const effectiveAtMs = Math.min(atMs, timeline.diveEndMs);
	const waypoints = sortedWaypointEvents(timeline);
	if (waypoints.length === 0) return (effectiveAtMs - timeline.diveStartMs) / 1000;
	const nextIndex = waypoints.findIndex((event) => event.atMs >= effectiveAtMs);
	if (nextIndex >= 0) {
		const previous = waypoints[nextIndex - 1] ?? null;
		const next = waypoints[nextIndex];
		const previousAtMs = previous?.atMs ?? timeline.diveStartMs;
		const previousDistanceM = previous?.cumulativeDistanceM ?? 0;
		return previousDistanceM + segmentSpeedMs(previous, next, timeline) * ((effectiveAtMs - previousAtMs) / 1000);
	}
	const last = waypoints[waypoints.length - 1];
	return last.cumulativeDistanceM + segmentSpeedMs(waypoints[waypoints.length - 2] ?? null, last, timeline) * ((effectiveAtMs - last.atMs) / 1000);
}

function speedAt(timeline: DiveTimeline, atMs: number, poolLength: number): number {
	void poolLength;
	const samples = timeline.samples;
	if (samples && samples.length > 0) {
		const closest = [...samples].reverse().find((sample) => sample.atMs <= atMs) ?? samples[0];
		return closest.speedMs;
	}
	if (atMs <= timeline.diveStartMs || atMs > timeline.diveEndMs) return 0;
	const waypoints = sortedWaypointEvents(timeline);
	if (waypoints.length === 0) return 1;
	const nextIndex = waypoints.findIndex((event) => event.atMs >= Math.min(atMs, timeline.diveEndMs));
	if (nextIndex >= 0) return segmentSpeedMs(waypoints[nextIndex - 1] ?? null, waypoints[nextIndex], timeline);
	const last = waypoints[waypoints.length - 1];
	return segmentSpeedMs(waypoints[waypoints.length - 2] ?? null, last, timeline);
}

function roundedRectAssPath(width: number, height: number, radius: number): string {
	const r = Math.min(radius, width / 2, height / 2);
	return [
		`m ${r} 0`,
		`l ${width - r} 0`,
		`b ${width} 0 ${width} 0 ${width} ${r}`,
		`l ${width} ${height - r}`,
		`b ${width} ${height} ${width} ${height} ${width - r} ${height}`,
		`l ${r} ${height}`,
		`b 0 ${height} 0 ${height} 0 ${height - r}`,
		`l 0 ${r}`,
		`b 0 0 0 0 ${r} 0`
	].join(' ');
}

function rectAssPath(x: number, y: number, width: number, height: number): string {
	const x2 = x + width;
	const y2 = y + height;
	return `m ${x} ${y} l ${x2} ${y} l ${x2} ${y2} l ${x} ${y2}`;
}

function totalRealizedDistanceM(timeline: DiveTimeline, poolLength: number): number {
	return Math.max(
		0,
		distanceAt(timeline, timeline.diveEndMs, poolLength),
		...(timeline.samples?.map((sample) => sample.distanceM).filter(Number.isFinite) ?? []),
		...timeline.laps.map((lap) => lap.cumulativeDistanceM),
		...(timeline.subSplits?.map((split) => split.cumulativeDistanceM) ?? [])
	);
}

function speedPlotDomainM(timeline: DiveTimeline, poolLength: number): number {
	return Math.max(SPEED_PLOT_DEFAULT_DOMAIN_M, totalRealizedDistanceM(timeline, poolLength), 1) * SPEED_PLOT_DOMAIN_PADDING_RATIO;
}

function speedSamplesFromTimeline(timeline: DiveTimeline): { distanceM: number; speedMs: number; atMs: number }[] {
	if (timeline.samples && timeline.samples.length > 0) {
		const first = timeline.samples[0];
		const start = timeline.diveStartMs < first.atMs
			? [{ atMs: timeline.diveStartMs, distanceM: 0, speedMs: first.speedMs }]
			: [];
		return [...start, ...timeline.samples]
			.filter((sample) => Number.isFinite(sample.atMs) && Number.isFinite(sample.distanceM) && Number.isFinite(sample.speedMs))
			.sort((a, b) => a.atMs - b.atMs);
	}

	const waypoints = sortedWaypointEvents(timeline);
	const samples: { distanceM: number; speedMs: number; atMs: number }[] = [];
	let previousAtMs = timeline.diveStartMs;
	let previousDistanceM = 0;
	for (const waypoint of waypoints) {
		const segmentMs = Math.max(1, waypoint.atMs - previousAtMs);
		const segmentDistanceM = Math.max(0, waypoint.cumulativeDistanceM - previousDistanceM);
		const segmentSpeedMs = segmentDistanceM / (segmentMs / 1000);
		if (samples.length === 0) {
			samples.push({ atMs: previousAtMs, distanceM: previousDistanceM, speedMs: segmentSpeedMs });
		}
		samples.push({ atMs: waypoint.atMs, distanceM: waypoint.cumulativeDistanceM, speedMs: segmentSpeedMs });
		previousAtMs = waypoint.atMs;
		previousDistanceM = waypoint.cumulativeDistanceM;
	}
	return samples;
}

function speedLineSamplesAt(args: {
	timeline: DiveTimeline;
	poolLength: number;
	atMs: number;
}): { distanceM: number; speedMs: number }[] {
	const currentDistanceM = distanceAt(args.timeline, args.atMs, args.poolLength);
	const currentSpeedMs = speedAt(args.timeline, args.atMs, args.poolLength);
	if (currentDistanceM <= 0) return [];
	const revealed = speedSamplesFromTimeline(args.timeline)
		.filter((sample) => sample.atMs <= args.atMs)
		.map((sample) => ({ distanceM: sample.distanceM, speedMs: sample.speedMs }));
	const hasRevealedPositiveWaypoint = revealed.some(
		(sample) => sample.distanceM > 0.001 && sample.distanceM < currentDistanceM - 0.001
	);
	if (!hasRevealedPositiveWaypoint) {
		const accelerationDistanceM = Math.min(SPEED_PLOT_FIRST_ACCELERATION_M, currentDistanceM);
		const firstSegment = [
			{ distanceM: 0, speedMs: 0 },
			{ distanceM: accelerationDistanceM, speedMs: currentSpeedMs }
		];
		if (currentDistanceM > accelerationDistanceM + 0.001) {
			firstSegment.push({ distanceM: currentDistanceM, speedMs: currentSpeedMs });
		}
		return firstSegment;
	}
	const last = revealed[revealed.length - 1];
	if (!last || currentDistanceM > last.distanceM + 0.001) {
		revealed.push({ distanceM: currentDistanceM, speedMs: currentSpeedMs });
	}
	return withFirstSpeedSegmentAcceleration(revealed, currentDistanceM, currentSpeedMs);
}

function steppedSvgPoints(points: { x: number; y: number }[]): string {
	if (points.length === 0) return '';
	const stepped = [`${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`];
	for (let i = 0; i < points.length - 1; i += 1) {
		const current = points[i];
		const next = points[i + 1];
		stepped.push(`${next.x.toFixed(1)},${current.y.toFixed(1)}`, `${next.x.toFixed(1)},${next.y.toFixed(1)}`);
	}
	return stepped.join(' ');
}

function overlaySvg(args: {
	timeline: DiveTimeline;
	poolLength: number;
	durationSeconds: number;
	width: number;
	height: number;
	atMs: number;
}): string {
	const isPortrait = args.height > args.width;
	const scale = Math.max(
		0.5,
		Math.min(2.5, (isPortrait ? args.width : args.height) / HUD_REFERENCE_SHORT_EDGE_PX)
	);
	const boxX = scaledCssPx(isPortrait ? rem(0.75) : rem(0.5), scale);
	const boxY = scaledCssPx(rem(0.75), scale);
	const boxW = isPortrait
		? args.width - 2 * boxX
		: Math.min(Math.round(args.width * 0.62), args.width - boxX * 2);
	const padX = scaledCssPx(isPortrait ? rem(1.05) : rem(0.85), scale);
	const padY = scaledCssPx(isPortrait ? rem(0.75) : rem(0.55), scale);
	const labelSize = scaledCssPx(isPortrait ? rem(0.7) : rem(0.64), scale);
	const valueSize = scaledCssPx(isPortrait ? rem(1.9) : rem(1.35), scale);
	const subSize = scaledCssPx(isPortrait ? rem(0.85) : rem(0.76), scale);
	const labelLineHeight = scaledCssPx((isPortrait ? rem(0.7) : rem(0.64)) * 1.2, scale);
	const valueLineHeight = scaledCssPx((isPortrait ? rem(1.9) : rem(1.35)) * 1.1, scale);
	const subLineHeight = scaledCssPx((isPortrait ? rem(0.85) : rem(0.76)) * 1.2, scale);
	const subMarginTop = scaledCssPx(rem(0.4), scale);
	const boxH = padY * 2 + labelLineHeight + valueLineHeight + subMarginTop + subLineHeight;
	const radius = scaledCssPx(14, scale);
	const labelSpacing = Math.max(0, labelSize * 0.08).toFixed(2);
	const innerX = boxX + padX;
	const innerY = boxY + padY;
	const rightX = boxX + boxW - padX;
	const valueY = innerY + labelLineHeight;
	const subY = valueY + valueLineHeight + subMarginTop;
	const atMs = Math.max(0, Math.min(args.atMs, args.durationSeconds * 1000));
	const distance = distanceAt(args.timeline, atMs, args.poolLength);
	const speed = speedAt(args.timeline, atMs, args.poolLength);
	const laps = args.timeline.laps.filter((lap) => lap.atMs <= atMs).length;

	const plotScale = Math.max(0.35, Math.min(1.25, args.width / SPEED_PLOT_REFERENCE_WIDTH_PX));
	const bandHeight = Math.min(Math.round(285 * plotScale), Math.round(args.height * 0.28));
	const safeX = Math.round(36 * plotScale);
	const bottomInset = Math.round(32 * plotScale);
	const bandX = safeX;
	const bandY = Math.max(0, args.height - bandHeight - bottomInset);
	const bandW = Math.max(1, args.width - safeX * 2);
	const plotPadLeft = Math.round(96 * plotScale);
	const plotPadRight = Math.round(42 * plotScale);
	const plotPadTop = Math.round(32 * plotScale);
	const plotPadBottom = Math.round(44 * plotScale);
	const plotX = bandX + plotPadLeft;
	const plotY = bandY + plotPadTop;
	const plotW = Math.max(1, bandW - plotPadLeft - plotPadRight);
	const plotH = Math.max(1, bandHeight - plotPadTop - plotPadBottom);
	const domainDistanceM = speedPlotDomainM(args.timeline, args.poolLength);
	const axisSize = Math.max(8, Math.round(30 * plotScale));
	const lineWidth = Math.max(2, Math.round(5 * plotScale));
	const gridWidth = Math.max(1, Math.round(1.35 * plotScale));
	const plotRadius = Math.round(18 * plotScale);
	const toX = (distanceM: number) => plotX + (Math.max(0, Math.min(domainDistanceM, distanceM)) / domainDistanceM) * plotW;
	const toY = (speedMs: number) => plotY + (1 - Math.max(0, Math.min(SPEED_PLOT_MAX_SPEED_MS, speedMs)) / SPEED_PLOT_MAX_SPEED_MS) * plotH;
	const xTicks = [0, 50, 100, 150, 200].filter((tick) => tick <= domainDistanceM);
	const yTicks = [0, 0.5, 1, 1.5, 2];
	const lineSamples = speedLineSamplesAt({ timeline: args.timeline, poolLength: args.poolLength, atMs });
	const speedPoints = steppedSvgPoints(lineSamples.map((sample) => ({ x: toX(sample.distanceM), y: toY(sample.speedMs) })));
	const currentPoint = distance > 0 ? { x: toX(distance), y: toY(speed) } : null;
	const watermarkSize = scaledCssPx(isPortrait ? rem(0.68) : rem(0.62), scale);
	const watermarkMargin = scaledCssPx(rem(0.75), scale);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}">
<defs>
<linearGradient id="speedPlotBg" x1="0" y1="${bandY}" x2="0" y2="${bandY + bandHeight}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0d1320" stop-opacity="0.86"/><stop offset="1" stop-color="#000000" stop-opacity="0.86"/></linearGradient>
<linearGradient id="speedPlotLine" x1="${plotX}" y1="0" x2="${plotX + plotW}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#5eead4"/></linearGradient>
</defs>
<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${radius}" fill="rgba(15, 23, 42, 0.55)"/>
<text x="${innerX}" y="${innerY}" dominant-baseline="text-before-edge" font-family="DejaVu Sans, Arial, sans-serif" font-size="${labelSize}" font-weight="400" letter-spacing="${labelSpacing}" fill="#cbd5e1">TIME</text>
<text x="${rightX}" y="${innerY}" text-anchor="end" dominant-baseline="text-before-edge" font-family="DejaVu Sans, Arial, sans-serif" font-size="${labelSize}" font-weight="400" letter-spacing="${labelSpacing}" fill="#cbd5e1">DISTANCE</text>
<text x="${innerX}" y="${valueY}" dominant-baseline="text-before-edge" font-family="DejaVu Sans Mono, ui-monospace, monospace" font-size="${valueSize}" font-weight="400" fill="#f1f5f9">${escapeXmlText(formatHudTime(diveElapsedAt(args.timeline, atMs)))}</text>
<text x="${rightX}" y="${valueY}" text-anchor="end" dominant-baseline="text-before-edge" font-family="DejaVu Sans Mono, ui-monospace, monospace" font-size="${valueSize}" font-weight="400" fill="#f1f5f9">${escapeXmlText(`${distance.toFixed(1)} m`)}</text>
<text x="${innerX}" y="${subY}" dominant-baseline="text-before-edge" font-family="DejaVu Sans, Arial, sans-serif" font-size="${subSize}" font-weight="400" fill="#cbd5e1">${escapeXmlText(`Lap ${laps}/${args.timeline.laps.length}`)}</text>
<text x="${rightX}" y="${subY}" text-anchor="end" dominant-baseline="text-before-edge" font-family="DejaVu Sans Mono, ui-monospace, monospace" font-size="${subSize}" font-weight="400" fill="#cbd5e1">${escapeXmlText(`${speed.toFixed(2)} m/s`)}</text>
<rect x="${bandX}" y="${bandY}" width="${bandW}" height="${bandHeight}" rx="${plotRadius}" fill="url(#speedPlotBg)"/>
${xTicks.map((tick) => {
		const x = Math.round(toX(tick));
		return `<line x1="${x}" y1="${plotY}" x2="${x}" y2="${plotY + plotH}" stroke="rgba(255,255,255,0.1)" stroke-width="${gridWidth}"/><text x="${x}" y="${Math.round(plotY + plotH + axisSize * 1.35)}" text-anchor="middle" dominant-baseline="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="${axisSize}" font-weight="600" fill="rgba(203,213,225,0.82)">${tick}m</text>`;
	}).join('')}
${yTicks.map((tick) => {
		const y = Math.round(toY(tick));
		return `<line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="rgba(255,255,255,0.1)" stroke-width="${gridWidth}"/><text x="${Math.round(plotX - axisSize * 0.55)}" y="${Math.round(y + axisSize * 0.15)}" text-anchor="end" dominant-baseline="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="${axisSize}" font-weight="600" fill="rgba(203,213,225,0.82)">${tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}</text>`;
	}).join('')}
<text x="${Math.round(bandX + axisSize * 0.8)}" y="${Math.round(plotY + plotH / 2)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${Math.round(bandX + axisSize * 0.8)} ${Math.round(plotY + plotH / 2)})" font-family="DejaVu Sans, Arial, sans-serif" font-size="${axisSize}" font-weight="600" fill="rgba(203,213,225,0.82)">speed [m/s]</text>
${speedPoints ? `<polyline points="${speedPoints}" fill="none" stroke="url(#speedPlotLine)" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
${currentPoint ? `<circle cx="${currentPoint.x.toFixed(1)}" cy="${currentPoint.y.toFixed(1)}" r="${Math.max(3, Math.round(6 * plotScale))}" fill="#f8fafc"/>` : ''}
<text x="${watermarkMargin}" y="${args.height - watermarkMargin}" dominant-baseline="auto" font-family="DejaVu Sans, Arial, sans-serif" font-size="${watermarkSize}" font-weight="400" fill="rgba(241,245,249,0.6)">${escapeXmlText('Overdive.app')}</text>
</svg>`;
}

async function writeSvgOverlayFrameSequence(args: {
	timeline: DiveTimeline;
	poolLength: number;
	durationSeconds: number;
	width: number;
	height: number;
}): Promise<{ framesDir: string; framePattern: string }> {
	const framesDir = join(tmpdir(), `overdive-overlay-frames-${randomUUID()}`);
	await mkdir(framesDir, { recursive: true });
	const durationSeconds = Math.max(args.durationSeconds, args.timeline.diveEndMs / 1000, 1);
	const frameCount = Math.max(2, Math.ceil(durationSeconds * 10) + 1);
	for (let frame = 0; frame < frameCount; frame += 1) {
		const atMs = Math.min(durationSeconds * 1000, frame * 100);
		const svg = overlaySvg({ ...args, durationSeconds, atMs });
		const png = new Resvg(svg, {
			fitTo: { mode: 'original' },
			font: {
				loadSystemFonts: true,
				defaultFontFamily: 'DejaVu Sans'
			}
		}).render().asPng();
		await writeFile(join(framesDir, `frame-${frame.toString().padStart(6, '0')}.png`), png);
	}
	return { framesDir, framePattern: join(framesDir, 'frame-%06d.png') };
}

function withFirstSpeedSegmentAcceleration(
	samples: { distanceM: number; speedMs: number }[],
	currentDistanceM: number,
	currentSpeedMs: number
): { distanceM: number; speedMs: number }[] {
	const firstPositive = samples.find((sample) => sample.distanceM > 0.001);
	const anchorSpeedMs = firstPositive?.speedMs ?? currentSpeedMs;
	const accelerationDistanceM = Math.min(
		SPEED_PLOT_FIRST_ACCELERATION_M,
		currentDistanceM,
		firstPositive?.distanceM ?? currentDistanceM
	);
	return [
		{ distanceM: 0, speedMs: 0 },
		{ distanceM: accelerationDistanceM, speedMs: anchorSpeedMs },
		...samples.filter((sample) => sample.distanceM > accelerationDistanceM + 0.001)
	];
}

function speedPlotAssEvents(args: {
	timeline: DiveTimeline;
	poolLength: number;
	durationSeconds: number;
	width: number;
	height: number;
}): string[] {
	const durationSeconds = Math.max(args.durationSeconds, args.timeline.diveEndMs / 1000, 1);
	const scale = Math.max(0.35, Math.min(1.25, args.width / SPEED_PLOT_REFERENCE_WIDTH_PX));
	const bandHeight = Math.min(Math.round(285 * scale), Math.round(args.height * 0.28));
	const safeX = Math.round(36 * scale);
	const bottomInset = Math.round(32 * scale);
	const bandX = safeX;
	const bandY = Math.max(0, args.height - bandHeight - bottomInset);
	const bandW = Math.max(1, args.width - safeX * 2);
	const padLeft = Math.round(96 * scale);
	const padRight = Math.round(42 * scale);
	const padTop = Math.round(32 * scale);
	const padBottom = Math.round(44 * scale);
	const plotX = bandX + padLeft;
	const plotY = bandY + padTop;
	const plotW = Math.max(1, bandW - padLeft - padRight);
	const plotH = Math.max(1, bandHeight - padTop - padBottom);
	const domainDistanceM = speedPlotDomainM(args.timeline, args.poolLength);
	const axisSize = Math.max(8, Math.round(30 * scale));
	const lineWidth = Math.max(2, Math.round(5 * scale));
	const gridWidth = Math.max(1, Math.round(1.35 * scale));
	const radius = Math.round(18 * scale);
	const events: string[] = [];
	const fullStart = formatAssTime(0);
	const fullEnd = formatAssTime(durationSeconds);
	const toX = (distanceM: number) => plotX + (Math.max(0, Math.min(domainDistanceM, distanceM)) / domainDistanceM) * plotW;
	const toY = (speedMs: number) => plotY + (1 - Math.max(0, Math.min(SPEED_PLOT_MAX_SPEED_MS, speedMs)) / SPEED_PLOT_MAX_SPEED_MS) * plotH;
	const xTicks = [0, 50, 100, 150, 200].filter((tick) => tick <= domainDistanceM);
	const yTicks = [0, 0.5, 1, 1.5, 2];

	events.push(`Dialogue: 0,${fullStart},${fullEnd},SpeedPlotBG,,0,0,0,,{\\an7\\pos(${bandX},${bandY})\\p1}${roundedRectAssPath(bandW, bandHeight, radius)}`);
	for (const tick of xTicks) {
		const x = Math.round(toX(tick));
		events.push(`Dialogue: 1,${fullStart},${fullEnd},SpeedPlotGrid,,0,0,0,,{\\an7\\pos(0,0)\\p1}${rectAssPath(x, plotY, gridWidth, plotH)}`);
		events.push(`Dialogue: 3,${fullStart},${fullEnd},SpeedPlotAxis,,0,0,0,,{\\an5\\pos(${x},${Math.round(plotY + plotH + axisSize * 1.35)})}${tick}m`);
	}
	for (const tick of yTicks) {
		const y = Math.round(toY(tick));
		events.push(`Dialogue: 1,${fullStart},${fullEnd},SpeedPlotGrid,,0,0,0,,{\\an7\\pos(0,0)\\p1}${rectAssPath(plotX, y, plotW, gridWidth)}`);
		events.push(`Dialogue: 3,${fullStart},${fullEnd},SpeedPlotAxis,,0,0,0,,{\\an6\\pos(${Math.round(plotX - axisSize * 0.55)},${Math.round(y + axisSize * 0.15)})}${tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}`);
	}
	events.push(`Dialogue: 3,${fullStart},${fullEnd},SpeedPlotAxis,,0,0,0,,{\\an5\\pos(${Math.round(bandX + axisSize * 0.8)},${Math.round(plotY + plotH / 2)})\\frz270}speed [m/s]`);

	for (let tick = 0; tick < Math.ceil(durationSeconds * 10); tick += 1) {
		const startSeconds = tick / 10;
		const atMs = startSeconds * 1000;
		const endSeconds = Math.min(durationSeconds, (tick + 1) / 10);
		const lineSamples = speedLineSamplesAt({ timeline: args.timeline, poolLength: args.poolLength, atMs });
		if (lineSamples.length < 2) continue;
		const projected = lineSamples.map((sample) => ({ x: toX(sample.distanceM), y: toY(sample.speedMs) }));
		const stepped = [projected[0]];
		for (let i = 0; i < projected.length - 1; i += 1) {
			const current = projected[i];
			const next = projected[i + 1];
			stepped.push({ x: next.x, y: current.y }, next);
		}
		const linePath = stepped.slice(0, -1).map((point, index) => {
			const next = stepped[index + 1];
			const x = Math.min(point.x, next.x) - lineWidth / 2;
			const y = Math.min(point.y, next.y) - lineWidth / 2;
			const width = Math.max(lineWidth, Math.abs(next.x - point.x) + lineWidth);
			const height = Math.max(lineWidth, Math.abs(next.y - point.y) + lineWidth);
			return rectAssPath(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
		}).join(' ');
		events.push(`Dialogue: 2,${formatAssTime(startSeconds)},${formatAssTime(endSeconds)},SpeedPlotLine,,0,0,0,,{\\an7\\pos(0,0)\\p1}${linePath}`);
	}

	return events;
}

function overlayAss(args: {
	timeline: DiveTimeline;
	poolLength: number;
	discipline: string;
	durationSeconds: number;
	width: number;
	height: number;
}): string {
	const durationSeconds = Math.max(args.durationSeconds, args.timeline.diveEndMs / 1000, 1);
	const events: string[] = [];
	const isPortrait = args.height > args.width;
	const scale = Math.max(
		0.5,
		Math.min(2.5, (isPortrait ? args.width : args.height) / HUD_REFERENCE_SHORT_EDGE_PX)
	);
	const boxX = scaledCssPx(isPortrait ? rem(0.75) : rem(0.5), scale);
	const boxY = scaledCssPx(rem(0.75), scale);
	const boxW = isPortrait
		? args.width - 2 * boxX
		: Math.min(Math.round(args.width * 0.62), args.width - boxX * 2);
	const padX = scaledCssPx(isPortrait ? rem(1.05) : rem(0.85), scale);
	const padY = scaledCssPx(isPortrait ? rem(0.75) : rem(0.55), scale);
	const labelSize = scaledCssPx(isPortrait ? rem(0.7) : rem(0.64), scale);
	const valueSize = scaledCssPx(isPortrait ? rem(1.9) : rem(1.35), scale);
	const subSize = scaledCssPx(isPortrait ? rem(0.85) : rem(0.76), scale);
	const labelLineHeight = scaledCssPx((isPortrait ? rem(0.7) : rem(0.64)) * 1.2, scale);
	const valueLineHeight = scaledCssPx((isPortrait ? rem(1.9) : rem(1.35)) * 1.1, scale);
	const subLineHeight = scaledCssPx((isPortrait ? rem(0.85) : rem(0.76)) * 1.2, scale);
	const subMarginTop = scaledCssPx(rem(0.4), scale);
	const watermarkSize = scaledCssPx(isPortrait ? rem(0.68) : rem(0.62), scale);
	const watermarkMargin = scaledCssPx(rem(0.75), scale);
	const boxH = padY * 2 + labelLineHeight + valueLineHeight + subMarginTop + subLineHeight;
	const radius = scaledCssPx(14, scale);
	const labelSpacing = Math.max(0, labelSize * 0.08).toFixed(2);
	const innerX = boxX + padX;
	const innerY = boxY + padY;
	const rightX = boxX + boxW - padX;
	const valueY = innerY + labelLineHeight;
	const subY = valueY + valueLineHeight + subMarginTop;
	const watermarkX = watermarkMargin;
	const watermarkY = args.height - watermarkMargin;

	for (let tick = 0; tick < Math.ceil(durationSeconds * 10); tick += 1) {
		const startSeconds = tick / 10;
		const atMs = startSeconds * 1000;
		const endSeconds = Math.min(durationSeconds, (tick + 1) / 10);
		const distance = distanceAt(args.timeline, atMs, args.poolLength);
		const speed = speedAt(args.timeline, atMs, args.poolLength);
		const laps = args.timeline.laps.filter((lap) => lap.atMs <= atMs).length;
		const start = formatAssTime(startSeconds);
		const end = formatAssTime(endSeconds);
		const bgShape = roundedRectAssPath(boxW, boxH, radius);
		events.push(
			`Dialogue: 0,${start},${end},HUDBG,,0,0,0,,{\\an7\\pos(${boxX},${boxY})\\p1}${bgShape}`,
			`Dialogue: 1,${start},${end},HUDLabel,,0,0,0,,{\\an7\\pos(${innerX},${innerY})}TIME`,
			`Dialogue: 1,${start},${end},HUDLabel,,0,0,0,,{\\an9\\pos(${rightX},${innerY})}DISTANCE`,
			`Dialogue: 1,${start},${end},HUDValue,,0,0,0,,{\\an7\\pos(${innerX},${valueY})}${escapeAssText(formatHudTime(diveElapsedAt(args.timeline, atMs)))}`,
			`Dialogue: 1,${start},${end},HUDValue,,0,0,0,,{\\an9\\pos(${rightX},${valueY})}${escapeAssText(`${distance.toFixed(1)} m`)}`,
			`Dialogue: 1,${start},${end},HUDSub,,0,0,0,,{\\an7\\pos(${innerX},${subY})}${escapeAssText(`Lap ${laps}/${args.timeline.laps.length}`)}`,
			`Dialogue: 1,${start},${end},HUDSubMono,,0,0,0,,{\\an9\\pos(${rightX},${subY})}${escapeAssText(`${speed.toFixed(2)} m/s`)}`
		);
	}

	events.push(...speedPlotAssEvents({
		timeline: args.timeline,
		poolLength: args.poolLength,
		durationSeconds,
		width: args.width,
		height: args.height
	}));

	events.push(
		`Dialogue: 2,${formatAssTime(0)},${formatAssTime(durationSeconds)},Watermark,,0,0,0,,{\\an1\\pos(${watermarkX},${watermarkY})}${escapeAssText('Overdive.app')}`
	);

	return `[Script Info]
ScriptType: v4.00+
PlayResX: ${args.width}
PlayResY: ${args.height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HUDBG,Arial,1,&H732A170F,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: HUDLabel,DejaVu Sans,${labelSize},&H00E1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,${labelSpacing},0,1,0,0,7,0,0,0,1
Style: HUDValue,DejaVu Sans Mono,${valueSize},&H00F9F5F1,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: HUDSub,DejaVu Sans,${subSize},&H00E1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: HUDSubMono,DejaVu Sans Mono,${subSize},&H00E1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotBG,Arial,1,&H73000000,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotGrid,Arial,1,&HCCFFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotLine,Arial,1,&H00BFD42D,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: SpeedPlotAxis,DejaVu Sans,${Math.max(8, Math.round(30 * Math.max(0.35, Math.min(1.25, args.width / SPEED_PLOT_REFERENCE_WIDTH_PX))))},&H2EE1D5CB,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Watermark,DejaVu Sans,${watermarkSize},&H66F9F5F1,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,1,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}

function masterObject(video: DiveVideoDoc): { bucket: string; key: string; contentType?: string } {
	if (video.cleanObject?.bucket && video.cleanObject.key) {
		return {
			bucket: video.cleanObject.bucket,
			key: video.cleanObject.key,
			contentType: video.cleanObject.contentType
		};
	}
	throw new HttpsError('failed-precondition', 'Dive video has no Wasabi clean object');
}

function assertWorkerBinaries(): { ffmpeg: string; ffprobe: string } {
	if (!ffmpegPath) throw new HttpsError('failed-precondition', 'ffmpeg binary is unavailable');
	if (!ffprobeStatic.path) throw new HttpsError('failed-precondition', 'ffprobe binary is unavailable');
	return { ffmpeg: ffmpegPath, ffprobe: ffprobeStatic.path };
}

async function claimJob(args: {
	uid?: string;
	jobId: string;
}): Promise<MediaProcessingJobDoc & { id: string }> {
	const db = getFirestore();
	const jobRef = db.collection('mediaProcessingJobs').doc(args.jobId);
	return db.runTransaction(async (transaction) => {
		const snap = await transaction.get(jobRef);
		if (!snap.exists) throw new HttpsError('not-found', 'Media processing job not found');
		const job = snap.data() as MediaProcessingJobDoc;
		if (args.uid && job.ownerId !== args.uid) {
			throw new HttpsError('permission-denied', 'You do not own this media processing job');
		}
		if (job.status === 'ready') return { ...job, id: snap.id };
		if (job.status === 'processing' && !isStaleProcessingJob(job)) {
			throw new HttpsError('failed-precondition', 'Media processing job is already running');
		}
		transaction.update(jobRef, {
			status: 'processing',
			attempts: FieldValue.increment(1),
			claimedAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});
		return { ...job, id: snap.id };
	});
}

async function withMasterFile<T>(video: DiveVideoDoc, fn: (path: string) => Promise<T>): Promise<T> {
	const object = masterObject(video);
	const bytes = await getObjectBytes({ bucket: object.bucket, key: object.key });
	const ext = object.contentType?.includes('webm') || video.mimeType?.includes('webm') ? 'webm' : 'mp4';
	const inputPath = join(tmpdir(), `overdive-${randomUUID()}.${ext}`);
	await writeFile(inputPath, bytes);
	try {
		return await fn(inputPath);
	} finally {
		await rm(inputPath, { force: true });
	}
}

async function probeMaster(video: DiveVideoDoc): Promise<Record<string, unknown>> {
	const { ffprobe } = assertWorkerBinaries();
	return withMasterFile(video, async (inputPath) => {
		const { stdout } = await execFileAsync(ffprobe, [
			'-v',
			'error',
			'-print_format',
			'json',
			'-show_format',
			'-show_streams',
			inputPath
		]);
		const output = JSON.parse(stdout) as ProbeOutput;
		const videoStream = output.streams?.find((stream) => stream.codec_type === 'video');
		const audioStream = output.streams?.find((stream) => stream.codec_type === 'audio');
		const durationSeconds = Number(output.format?.duration);
		const sizeBytes = Number(output.format?.size);
		return withoutUndefined({
			widthPx: videoStream?.width ?? video.widthPx,
			heightPx: videoStream?.height ?? video.heightPx,
			durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : video.durationSeconds,
			sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : video.sizeBytes,
			actualFrameRate:
				frameRate(videoStream?.avg_frame_rate) ??
				frameRate(videoStream?.r_frame_rate) ??
				video.actualFrameRate,
			probeFormatName: output.format?.format_name,
			probeVideoCodec: videoStream?.codec_name,
			probeAudioCodec: audioStream?.codec_name,
			probeRotationDeg: streamRotation(videoStream)
		});
	});
}

async function generateThumbnail(args: {
	videoId: string;
	video: DiveVideoDoc;
}): Promise<{ bucket: string; key: string; sizeBytes: number }> {
	const { ffmpeg } = assertWorkerBinaries();
	const object = masterObject(args.video);
	return withMasterFile(args.video, async (inputPath) => {
		const outputPath = join(tmpdir(), `overdive-thumb-${randomUUID()}.jpg`);
		try {
			await execFileAsync(ffmpeg, [
				'-y',
				'-i',
				inputPath,
				'-vf',
				'scale=480:-2',
				'-frames:v',
				'1',
				'-q:v',
				'4',
				outputPath
			]);
			const bytes = await readFile(outputPath);
			const ownerId = args.video.ownerId ?? args.video.userId;
			if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
			const key = `users/${ownerId}/videos/${args.videoId}/thumb.jpg`;
			await putObjectBytes({ bucket: object.bucket, key, body: bytes, contentType: 'image/jpeg' });
			return { bucket: object.bucket, key, sizeBytes: bytes.byteLength };
		} finally {
			await rm(outputPath, { force: true });
		}
	});
}

async function generatePlaybackProxy(args: {
	videoId: string;
	video: DiveVideoDoc;
}): Promise<DiveVideoArtifactRef> {
	const { ffmpeg, ffprobe } = assertWorkerBinaries();
	const object = masterObject(args.video);
	return withMasterFile(args.video, async (inputPath) => {
		const outputPath = join(tmpdir(), `overdive-proxy-${randomUUID()}.mp4`);
		try {
			await execFileAsync(ffmpeg, [
				'-y',
				'-i',
				inputPath,
				'-map',
				'0:v:0',
				'-map',
				'0:a?',
				'-vf',
				'scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2',
				'-c:v',
				'libx264',
				'-preset',
				'veryfast',
				'-crf',
				'28',
				'-pix_fmt',
				'yuv420p',
				'-c:a',
				'aac',
				'-b:a',
				'96k',
				'-movflags',
				'+faststart',
				outputPath
			]);

			const bytes = await readFile(outputPath);
			const ownerId = args.video.ownerId ?? args.video.userId;
			if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
			const key = `users/${ownerId}/videos/${args.videoId}/proxy/720p.mp4`;
			await putObjectBytes({ bucket: object.bucket, key, body: bytes, contentType: 'video/mp4' });

			const probe = await probeMasterFile({ ffprobe, inputPath: outputPath });
			return withoutUndefined({
				kind: 'playback-proxy',
				profile: 'mp4-720p',
				object: {
					provider: 'wasabi',
					bucket: object.bucket,
					key,
					contentType: 'video/mp4',
					sizeBytes: bytes.byteLength
				},
				widthPx: probe.widthPx,
				heightPx: probe.heightPx,
				durationSeconds: probe.durationSeconds,
				sizeBytes: bytes.byteLength,
				contentType: 'video/mp4'
			}) as unknown as DiveVideoArtifactRef;
		} finally {
			await rm(outputPath, { force: true });
		}
	});
}

async function generateOverlayDownload(args: {
	videoId: string;
	video: DiveVideoDoc;
}): Promise<DiveVideoArtifactRef> {
	const { ffmpeg, ffprobe } = assertWorkerBinaries();
	const object = masterObject(args.video);
	if (!args.video.timeline) {
		throw new HttpsError('failed-precondition', 'Dive video has no timeline for overlay export');
	}
	const ownerId = args.video.ownerId ?? args.video.userId;
	if (!ownerId) throw new HttpsError('failed-precondition', 'Dive video has no owner');
	const exportProfile = overlayExportProfile(args.video);
	const outputDimensions = scaledDimensions(displayDimensions(args.video), exportProfile.maxEdge);
	const boundedDurationSeconds = Math.max(1, Math.ceil((args.video.durationSeconds ?? 0) + 1));
	return withMasterFile(args.video, async (inputPath) => {
		const outputPath = join(tmpdir(), `overdive-overlay-${randomUUID()}.mp4`);
		let assPath: string | null = null;
		let svgFramesDir: string | null = null;
		try {
			try {
				const overlayFrames = await writeSvgOverlayFrameSequence({
					timeline: args.video.timeline as DiveTimeline,
					poolLength: args.video.poolLength ?? 25,
					durationSeconds: args.video.durationSeconds ?? 0,
					width: outputDimensions.width,
					height: outputDimensions.height
				});
				svgFramesDir = overlayFrames.framesDir;
				const baseFilter = [
					...displayRotationFilters(args.video),
					`scale=${outputDimensions.width}:${outputDimensions.height}`
				].join(',');
				const filterComplex = `[0:v]${baseFilter}[base];[1:v]format=rgba[overlay];[base][overlay]overlay=0:0:shortest=1,format=yuv420p[v]`;
				await execFileAsync(ffmpeg, [
					'-y',
					'-fflags',
					'+genpts',
					'-i',
					inputPath,
					'-framerate',
					'10',
					'-start_number',
					'0',
					'-i',
					overlayFrames.framePattern,
					'-t',
					String(boundedDurationSeconds),
					'-filter_complex',
					filterComplex,
					'-map',
					'[v]',
					'-map',
					'0:a:0?',
					'-c:v',
					'libx264',
					'-preset',
					'ultrafast',
					'-crf',
					'28',
					'-pix_fmt',
					'yuv420p',
					'-c:a',
					'aac',
					'-b:a',
					'96k',
					'-shortest',
					'-max_muxing_queue_size',
					'1024',
					'-movflags',
					'+faststart',
					outputPath
				], { timeout: 8 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
			} catch (err) {
				logger.warn('SVG overlay render failed; falling back to ASS renderer', {
					videoId: args.videoId,
					error: err instanceof Error ? err.message : String(err)
				});
				assPath = join(tmpdir(), `overdive-overlay-${randomUUID()}.ass`);
				await writeFile(
					assPath,
					overlayAss({
						timeline: args.video.timeline as DiveTimeline,
						poolLength: args.video.poolLength ?? 25,
						discipline: args.video.discipline ?? 'DYN',
						durationSeconds: args.video.durationSeconds ?? 0,
						width: outputDimensions.width,
						height: outputDimensions.height
					})
				);
				const filterChain = [
					...displayRotationFilters(args.video),
					`scale=${outputDimensions.width}:${outputDimensions.height}`,
					`subtitles=${assPath}`
				].join(',');
				await execFileAsync(ffmpeg, [
					'-y',
					'-fflags',
					'+genpts',
					'-i',
					inputPath,
					'-t',
					String(boundedDurationSeconds),
					'-map',
					'0:v:0',
					'-map',
					'0:a:0?',
					'-vf',
					filterChain,
					'-c:v',
					'libx264',
					'-preset',
					'ultrafast',
					'-crf',
					'28',
					'-pix_fmt',
					'yuv420p',
					'-c:a',
					'aac',
					'-b:a',
					'96k',
					'-shortest',
					'-max_muxing_queue_size',
					'1024',
					'-movflags',
					'+faststart',
					outputPath
				], { timeout: 8 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
			}

			const bytes = await readFile(outputPath);
			const key = `users/${ownerId}/videos/${args.videoId}/overlay/download.mp4`;
			await putObjectBytes({ bucket: object.bucket, key, body: bytes, contentType: 'video/mp4' });
			const probe = await probeMasterFile({ ffprobe, inputPath: outputPath });
			return withoutUndefined({
				kind: 'overlay-download',
				profile: exportProfile.profile,
				object: {
					provider: 'wasabi',
					bucket: object.bucket,
					key,
					contentType: 'video/mp4',
					sizeBytes: bytes.byteLength
				},
				widthPx: probe.widthPx,
				heightPx: probe.heightPx,
				durationSeconds: probe.durationSeconds,
				sizeBytes: bytes.byteLength,
				contentType: 'video/mp4',
				styleVersion: OVERLAY_STYLE_VERSION,
				disposable: true
			}) as unknown as DiveVideoArtifactRef;
		} finally {
			await Promise.all([
				rm(outputPath, { force: true }),
				assPath ? rm(assPath, { force: true }) : Promise.resolve(),
				svgFramesDir ? rm(svgFramesDir, { recursive: true, force: true }) : Promise.resolve()
			]);
		}
	});
}

async function probeMasterFile(args: {
	ffprobe: string;
	inputPath: string;
}): Promise<Record<string, unknown>> {
	const { stdout } = await execFileAsync(args.ffprobe, [
		'-v',
		'error',
		'-print_format',
		'json',
		'-show_format',
		'-show_streams',
		args.inputPath
	]);
	const output = JSON.parse(stdout) as ProbeOutput;
	const videoStream = output.streams?.find((stream) => stream.codec_type === 'video');
	const durationSeconds = Number(output.format?.duration);
	return withoutUndefined({
		widthPx: videoStream?.width,
		heightPx: videoStream?.height,
		durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined
	});
}

function withPlaybackProxyArtifact(
	artifacts: DiveVideoArtifactRef[] | undefined,
	proxy: DiveVideoArtifactRef
): DiveVideoArtifactRef[] {
	return [
		...(artifacts ?? []).filter((artifact) => artifact.kind !== 'playback-proxy'),
		proxy
	];
}

function withArtifact(
	artifacts: DiveVideoArtifactRef[] | undefined,
	artifact: DiveVideoArtifactRef
): DiveVideoArtifactRef[] {
	return [
		...(artifacts ?? []).filter((existing) => existing.kind !== artifact.kind),
		artifact
	];
}

async function markFailed(args: {
	jobId: string;
	videoId: string;
	type: DiveVideoProcessingJob;
	error: unknown;
}): Promise<void> {
	const message = args.error instanceof Error ? args.error.message : String(args.error);
	const db = getFirestore();
	const stateKey = stateKeyFor(args.type);
	const videoUpdate: Record<string, unknown> = {
		'processingState.lastError': message,
		'processingState.lastErrorAt': FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp()
	};
	if (stateKey) videoUpdate[`processingState.${stateKey}`] = 'retryable';
	const updates: Promise<unknown>[] = [
		db.collection('mediaProcessingJobs').doc(args.jobId).update({
			status: 'retryable',
			lastError: message,
			updatedAt: FieldValue.serverTimestamp()
		}),
		db.collection('diveVideos').doc(args.videoId).update(videoUpdate)
	];
	if (args.type === 'generate-overlay-download') {
		updates.push(
			db.collection('diveVideos').doc(args.videoId).collection('processingLocks').doc('overlayDownload').set({
				jobId: args.jobId,
				status: 'retryable',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true })
		);
	}
	await Promise.all(updates);
}

async function runMediaJob(args: { jobId: string; uid?: string }): Promise<{
	jobId: string;
	status: 'ready';
	type?: DiveVideoProcessingJob;
	alreadyComplete?: boolean;
}> {
	const db = getFirestore();
	const job = await claimJob({ uid: args.uid, jobId: args.jobId });
	if (job.status === 'ready') return { jobId: args.jobId, status: 'ready', alreadyComplete: true };

	try {
		const videoRef = db.collection('diveVideos').doc(job.videoId);
		const videoSnap = await videoRef.get();
		if (!videoSnap.exists) throw new HttpsError('not-found', 'Dive video not found');
		const video = videoSnap.data() as DiveVideoDoc;
		const ownerId = video.ownerId ?? video.userId;
		if (ownerId !== job.ownerId) {
			throw new HttpsError('failed-precondition', 'Media job owner does not match dive video owner');
		}
		if (args.uid && ownerId !== args.uid) {
			throw new HttpsError('permission-denied', 'You do not own this dive video');
		}

		if (job.type === 'probe-master') {
			const probe = await probeMaster(video);
			await videoRef.update({
				...probe,
				'processingState.master': 'ready',
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type),
				updatedAt: FieldValue.serverTimestamp()
			});
		} else if (job.type === 'generate-thumbnail') {
			const thumbnail = await generateThumbnail({ videoId: job.videoId, video });
			await videoRef.update({
				thumbnailPath: thumbnail.key,
				thumbnailObject: {
					provider: 'wasabi',
					bucket: thumbnail.bucket,
					key: thumbnail.key,
					contentType: 'image/jpeg',
					sizeBytes: thumbnail.sizeBytes
				},
				'processingState.thumbnail': 'ready',
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type),
				updatedAt: FieldValue.serverTimestamp()
			});
		} else if (job.type === 'generate-playback-proxy') {
			const proxy = await generatePlaybackProxy({ videoId: job.videoId, video });
			await videoRef.update({
				artifacts: withPlaybackProxyArtifact(video.artifacts, proxy),
				'processingState.playbackProxy': 'ready',
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type),
				updatedAt: FieldValue.serverTimestamp()
			});
		} else if (job.type === 'generate-overlay-download') {
			const lockRef = videoRef.collection('processingLocks').doc('overlayDownload');
			const lockSnap = await lockRef.get();
			const lock = lockSnap.exists ? lockSnap.data() as OverlayRequestLockDoc : null;
			const currentOverlay = video.artifacts?.find(
				(artifact) => artifact.kind === 'overlay-download' && artifact.styleVersion === OVERLAY_STYLE_VERSION
			);
			if (currentOverlay) {
				await Promise.all([
					db.collection('mediaProcessingJobs').doc(args.jobId).update({
						status: 'ready',
						completedAt: FieldValue.serverTimestamp(),
						updatedAt: FieldValue.serverTimestamp()
					}),
					lockRef.set({
						status: 'ready',
						updatedAt: FieldValue.serverTimestamp()
					}, { merge: true })
				]);
				return { jobId: args.jobId, status: 'ready', type: job.type, alreadyComplete: true };
			}
			if (lock?.jobId && lock.jobId !== args.jobId) {
				await db.collection('mediaProcessingJobs').doc(args.jobId).update({
					status: 'ready',
					supersededByJobId: lock.jobId,
					completedAt: FieldValue.serverTimestamp(),
					updatedAt: FieldValue.serverTimestamp()
				});
				return { jobId: args.jobId, status: 'ready', type: job.type, alreadyComplete: true };
			}
			await lockRef.set({
				jobId: args.jobId,
				status: 'processing',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true });
			const overlay = await generateOverlayDownload({ videoId: job.videoId, video });
			await videoRef.update({
				storagePathBurned: overlay.object.key,
				burnedObject: overlay.object,
				artifacts: withArtifact(video.artifacts, overlay),
				overlayStyleVersion: OVERLAY_STYLE_VERSION,
				'processingState.overlayDownload': 'ready',
				'processingState.pendingJobs': FieldValue.arrayRemove(job.type),
				updatedAt: FieldValue.serverTimestamp()
			});
			await videoRef.collection('processingLocks').doc('overlayDownload').set({
				jobId: args.jobId,
				status: 'ready',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true });
		} else {
			throw new HttpsError(
				'failed-precondition',
				`Media job type ${job.type} is queued but not implemented yet`
			);
		}

		await db.collection('mediaProcessingJobs').doc(args.jobId).update({
			status: 'ready',
			completedAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});
		return { jobId: args.jobId, status: 'ready', type: job.type };
	} catch (err) {
		logger.error('processMediaJob failed', { jobId: args.jobId, err });
		await markFailed({ jobId: args.jobId, videoId: job.videoId, type: job.type, error: err });
		throw err;
	}
}

export const requestOverlayDownload = onCall(
	{
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 60,
		memory: '256MiB'
	},
	async (request) => {
		const uid = requireUid(request.auth);
		const data = asRecord(request.data);
		const videoId = requiredString(data, 'videoId');
		const db = getFirestore();
		const videoRef = db.collection('diveVideos').doc(videoId);
		const lockRef = videoRef.collection('processingLocks').doc('overlayDownload');
		return db.runTransaction(async (transaction) => {
			const [videoSnap, lockSnap] = await Promise.all([
				transaction.get(videoRef),
				transaction.get(lockRef)
			]);
			if (!videoSnap.exists) throw new HttpsError('not-found', 'Dive video not found');
			const video = videoSnap.data() as DiveVideoDoc;
			const ownerId = video.ownerId ?? video.userId;
			if (ownerId !== uid) {
				throw new HttpsError('permission-denied', 'Only the video owner can request overlay export');
			}

			const currentOverlay = video.artifacts?.find(
				(artifact) => artifact.kind === 'overlay-download' && artifact.styleVersion === OVERLAY_STYLE_VERSION
			);
			if (currentOverlay) {
				transaction.set(lockRef, {
					status: 'ready',
					updatedAt: FieldValue.serverTimestamp()
				}, { merge: true });
				return { queued: false, ready: true };
			}

			const lock = lockSnap.exists ? lockSnap.data() as OverlayRequestLockDoc : null;
			const lockUpdatedAt = lock?.updatedAt?.toMillis?.() ?? 0;
			const lockIsActive =
				(lock?.status === 'queued' || lock?.status === 'processing') &&
				Date.now() - lockUpdatedAt < OVERLAY_REQUEST_LOCK_STALE_MS;
			if (lockIsActive && lock?.jobId) {
				return { jobId: lock.jobId, queued: true, existing: true };
			}

			const jobRef = db.collection('mediaProcessingJobs').doc();
			const jobId = jobRef.id;
			transaction.set(jobRef, {
				videoId,
				ownerId,
				type: 'generate-overlay-download',
				status: 'queued',
				attempts: 0,
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp()
			});
			transaction.set(lockRef, {
				jobId,
				status: 'queued',
				updatedAt: FieldValue.serverTimestamp()
			}, { merge: true });
			transaction.update(videoRef, {
				'processingState.overlayDownload': 'queued',
				'processingState.pendingJobs': FieldValue.arrayUnion('generate-overlay-download'),
				updatedAt: FieldValue.serverTimestamp()
			});
			return { jobId, queued: true };
		});
	}
);

export const processMediaJob = onCall(
	{
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 540,
		memory: '4GiB',
		cpu: 2,
		concurrency: 1
	},
	async (request) => {
		const uid = requireUid(request.auth);
		const data = asRecord(request.data);
		const jobId = requiredString(data, 'jobId');
		return runMediaJob({ jobId, uid });
	}
);

export const onMediaProcessingJobCreated = onDocumentCreated(
	{
		document: 'mediaProcessingJobs/{jobId}',
		secrets: [WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY],
		timeoutSeconds: 540,
		memory: '4GiB',
		cpu: 2,
		concurrency: 1
	},
	async (event) => {
		const snap = event.data;
		if (!snap) return;
		const job = snap.data() as MediaProcessingJobDoc;
		if (!isImplementedAutomaticJob(job.type)) {
			logger.info('media job queued for later worker implementation', {
				jobId: event.params.jobId,
				type: job.type
			});
			return;
		}
		await runMediaJob({ jobId: event.params.jobId });
	}
);