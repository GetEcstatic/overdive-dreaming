/**
 * Share Card Image Generator
 * Creates a styled image from session data for social sharing
 * Mirrors the SessionCard dashboard layout for IG stories
 */

import type { RoutineLog, RoutineTemplate, Discipline } from '$lib/types';
import { formatTime } from '$lib/utils/time';
import { format as formatDate } from 'date-fns';
import { getFormattedMetric } from '$lib/utils/metrics';
import { formatTimeOfDay } from '$lib/utils/sessions';
import { getWasabiReadUrl } from '$lib/media/client';

interface ShareCardData {
	log: RoutineLog;
	routine: RoutineTemplate;
	userName?: string;
}

interface ShareCardOptions {
	width?: number;
	height?: number;
	brandColor?: string;
	secondaryColor?: string;
	format?: 'square' | 'story';
}

const defaultOptions: Required<ShareCardOptions> = {
	width: 1080,
	height: 1920,
	brandColor: '#14b8a6',
	secondaryColor: '#38bdf8',
	format: 'story'
};

function getDisciplineColor(discipline: Discipline): string {
	const colors: Record<Discipline, string> = {
		DYN: '#14b8a6',
		DNF: '#38bdf8',
		DYNB: '#fbbf24',
		STA: '#a78bfa'
	};
	return colors[discipline] || '#14b8a6';
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number, y: number, width: number, height: number, radius: number
): void {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - radius, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
	ctx.lineTo(x + width, y + height - radius);
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
	ctx.lineTo(x + radius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

async function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise(async (resolve, reject) => {
		try {
			const response = await fetch(url, { mode: 'cors' });
			if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
			const blob = await response.blob();
			const objectUrl = URL.createObjectURL(blob);
			const img = new Image();
			img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
			img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')); };
			img.src = objectUrl;
		} catch (error) {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = () => reject(error);
			img.src = url;
		}
	});
}

function getNotesPreview(notes?: string): string | null {
	if (!notes) return null;
	const trimmed = notes.trim();
	const firstLine = trimmed.split('\n')[0].trim();
	if (firstLine.length > 80) return firstLine.slice(0, 77) + '...';
	return firstLine || null;
}

/**
 * Generate share card image as data URL
 * Layout mirrors the SessionCard component from the dashboard
 */
export async function generateShareCard(
	data: ShareCardData,
	options: ShareCardOptions = {}
): Promise<string> {
	const opts = { ...defaultOptions, ...options };
	const { log, routine, userName } = data;
	const { width, height } = opts;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not get canvas context');

	const disciplineColor = getDisciplineColor(log.disciplineUsed);

	// Use same metric system as SessionCard
	const heroMetric = getFormattedMetric(
		routine.displayConfig.heroMetric, routine.displayConfig.heroMetricLabel, log, routine
	);
	const secondaryMetric = getFormattedMetric(
		routine.displayConfig.secondaryMetric, routine.displayConfig.secondaryMetricLabel, log, routine
	);
	const tertiaryMetric = routine.displayConfig.tertiaryMetric && routine.displayConfig.tertiaryMetricLabel
		? getFormattedMetric(routine.displayConfig.tertiaryMetric, routine.displayConfig.tertiaryMetricLabel, log, routine)
		: null;

	const dateStr = formatDate(log.date.toDate(), 'MMM d, yyyy');
	const timeStr = formatDate(log.date.toDate(), 'h:mm a');
	const notesPreview = getNotesPreview(log.notes);

	// Session tags (same as SessionCard)
	const sessionTags: string[] = [];
	if (log.isCompetition) sessionTags.push('Comp');
	if (log.compeitionOrg) sessionTags.push(log.compeitionOrg.toUpperCase());
	if (log.cardTag) {
		const labels: Record<string, string> = { white: '⬜️', yellow: '🟨', red: '🟥' };
		sessionTags.push(labels[log.cardTag] ?? log.cardTag);
	}
	if (log.recordTag) sessionTags.push(log.recordTag);

	// Load session photo
	let sessionPhoto: HTMLImageElement | null = null;
	let photoUrl = log.photoUrl || log.thumbnailImageUrl;
	if (log.photoObject?.provider === 'wasabi') {
		try {
			const read = await getWasabiReadUrl({
				kind: 'session-photo',
				routineLogId: log.id,
				key: log.photoObject.key,
				bucket: log.photoObject.bucket
			});
			photoUrl = read.url;
		} catch (e) {
			console.warn('Failed to resolve Wasabi session photo:', e);
		}
	}
	if (photoUrl) {
		try { sessionPhoto = await loadImage(photoUrl); }
		catch (e) { console.warn('Failed to load session photo:', e); }
	}

	// === BACKGROUND ===
	const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
	bgGrad.addColorStop(0, '#0f172a');
	bgGrad.addColorStop(0.5, '#1e293b');
	bgGrad.addColorStop(1, '#0f172a');
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, width, height);

	// Card layout constants
	const cardX = 32;
	const cardW = width - cardX * 2;
	const cardPad = 40;
	const cardRadius = 24;
	const cx = cardX + cardPad;
	const cw = cardW - cardPad * 2;

	// First pass: calculate card height
	const profileSize = 52;
	let contentH = 0;
	contentH += profileSize + 16; // header
	contentH += 34; // routine + discipline
	if (sessionTags.length > 0) contentH += 42;
	contentH += 28; // gradient line
	if (notesPreview) contentH += 40;
	contentH += 26 + 120 + 20; // hero label + value + gap
	const metricBoxH = 100;
	contentH += metricBoxH + 24;
	const photoH = sessionPhoto ? 360 : 0;
	if (sessionPhoto) contentH += photoH + 16;

	const cardH = contentH + cardPad * 2;
	const cardY = Math.max(40, (height - cardH - 80) / 2);

	// === DRAW CARD BACKGROUND ===
	ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
	roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
	ctx.fill();
	ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
	ctx.lineWidth = 1;
	roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
	ctx.stroke();

	// === CARD CONTENT ===
	let cy = cardY + cardPad;

	// --- Profile ---
	const avatarR = profileSize / 2;
	ctx.fillStyle = disciplineColor + '50';
	ctx.beginPath();
	ctx.arc(cx + avatarR, cy + avatarR, avatarR, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText((userName?.charAt(0) ?? 'U').toUpperCase(), cx + avatarR, cy + avatarR + 9);

	const nameX = cx + profileSize + 14;
	ctx.fillStyle = '#ffffff';
	ctx.font = '600 28px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText(userName ?? 'Diver', nameX, cy + 22);

	let meta = dateStr;
	if (log.timeOfDay) meta += ' \u2022 ' + formatTimeOfDay(log.timeOfDay);
	meta += ' \u2022 ' + timeStr;
	ctx.fillStyle = '#94a3b8';
	ctx.font = '400 20px system-ui, -apple-system, sans-serif';
	ctx.fillText(meta, nameX, cy + 48);
	cy += profileSize + 16;

	// --- Routine + Discipline ---
	ctx.fillStyle = '#cbd5e1';
	ctx.font = '500 24px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'left';
	let rName = routine.name;
	const maxNW = cw - 120;
	while (ctx.measureText(rName).width > maxNW && rName.length > 10) {
		rName = rName.slice(0, -4) + '...';
	}
	ctx.fillText(rName, cx, cy + 4);

	ctx.fillStyle = '#94a3b8';
	ctx.font = '400 24px system-ui, -apple-system, sans-serif';
	const rnW = ctx.measureText(rName).width;
	ctx.fillText(' \u2022 ', cx + rnW, cy + 4);

	ctx.fillStyle = disciplineColor;
	ctx.font = '500 24px system-ui, -apple-system, sans-serif';
	const dotW = ctx.measureText(' \u2022 ').width;
	ctx.fillText(log.disciplineUsed, cx + rnW + dotW, cy + 4);
	cy += 34;

	// --- Tags ---
	if (sessionTags.length > 0) {
		let tagX = cx;
		ctx.font = '500 16px system-ui, -apple-system, sans-serif';
		for (const tag of sessionTags) {
			const tw = ctx.measureText(tag).width + 20;
			const th = 28;
			ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
			roundRect(ctx, tagX, cy, tw, th, th / 2);
			ctx.fill();
			ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
			ctx.lineWidth = 1;
			roundRect(ctx, tagX, cy, tw, th, th / 2);
			ctx.stroke();
			ctx.fillStyle = '#e0f2fe';
			ctx.textAlign = 'center';
			ctx.fillText(tag, tagX + tw / 2, cy + 19);
			tagX += tw + 8;
		}
		cy += 42;
	}

	// --- Gradient line ---
	const lineGrad = ctx.createLinearGradient(cx, 0, cx + cw, 0);
	lineGrad.addColorStop(0, disciplineColor);
	lineGrad.addColorStop(0.5, '#10b981');
	lineGrad.addColorStop(1, disciplineColor);
	ctx.fillStyle = lineGrad;
	ctx.fillRect(cx, cy, cw, 3);
	cy += 28;

	// --- Notes ---
	if (notesPreview) {
		ctx.fillStyle = '#94a3b8';
		ctx.font = 'italic 22px system-ui, -apple-system, sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText('"' + notesPreview + '"', cx, cy + 4);
		cy += 40;
	}

	// --- Hero metric ---
	ctx.fillStyle = '#94a3b8';
	ctx.font = '500 20px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(heroMetric.label, width / 2, cy);
	cy += 6;

	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 120px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(heroMetric.value, width / 2, cy + 100);
	cy += 120 + 20;

	// --- Metrics row ---
	const metricBoxes: { label: string; value: string }[] = [
		{ label: secondaryMetric.label, value: secondaryMetric.value }
	];
	if (tertiaryMetric) metricBoxes.push({ label: tertiaryMetric.label, value: tertiaryMetric.value });
	metricBoxes.push(
		{ label: '💪 RPE', value: log.rpe !== undefined ? String(log.rpe) : '—' },
		{ label: '😊 Joy', value: log.joyScale !== undefined ? String(log.joyScale) : '—' }
	);

	const boxCount = metricBoxes.length;
	const boxGap = 12;
	const boxW = (cw - boxGap * (boxCount - 1)) / boxCount;

	for (let i = 0; i < boxCount; i++) {
		const bx = cx + i * (boxW + boxGap);
		const mb = metricBoxes[i];

		ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
		roundRect(ctx, bx, cy, boxW, metricBoxH, 12);
		ctx.fill();
		ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
		ctx.lineWidth = 1;
		roundRect(ctx, bx, cy, boxW, metricBoxH, 12);
		ctx.stroke();

		ctx.fillStyle = '#94a3b8';
		ctx.font = '500 15px system-ui, -apple-system, sans-serif';
		ctx.textAlign = 'center';
		let label = mb.label;
		while (ctx.measureText(label).width > boxW - 12 && label.length > 3) {
			label = label.slice(0, -2) + '\u2026';
		}
		ctx.fillText(label, bx + boxW / 2, cy + 30);

		ctx.fillStyle = '#f1f5f9';
		let vfs = 30;
		ctx.font = 'bold ' + vfs + 'px system-ui, -apple-system, sans-serif';
		while (ctx.measureText(mb.value).width > boxW - 16 && vfs > 16) {
			vfs -= 2;
			ctx.font = 'bold ' + vfs + 'px system-ui, -apple-system, sans-serif';
		}
		ctx.fillText(mb.value, bx + boxW / 2, cy + 72);
	}
	cy += metricBoxH + 24;

	// --- Photo ---
	if (sessionPhoto) {
		const photoRadius = 16;
		ctx.save();
		roundRect(ctx, cx, cy, cw, photoH, photoRadius);
		ctx.clip();

		const imgAspect = sessionPhoto.width / sessionPhoto.height;
		const boxAspect = cw / photoH;
		let dw, dh, dx, dy;
		if (imgAspect > boxAspect) {
			dh = photoH; dw = dh * imgAspect;
			dx = cx + (cw - dw) / 2; dy = cy;
		} else {
			dw = cw; dh = dw / imgAspect;
			dx = cx; dy = cy + (photoH - dh) / 2;
		}
		ctx.drawImage(sessionPhoto, dx, dy, dw, dh);
		ctx.restore();
	}

	// === BRANDING ===
	const brandY = cardY + cardH + 36;
	if (userName) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
		ctx.font = '400 22px system-ui, -apple-system, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('@' + userName, width / 2, brandY);
	}
	ctx.fillStyle = disciplineColor + '60';
	ctx.font = '500 20px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('overdive.app', width / 2, brandY + 32);

	return canvas.toDataURL('image/png');
}

/**
 * Download the share card as an image file
 */
export async function downloadShareCard(
	data: ShareCardData,
	filename = 'overdive-session.png',
	options: ShareCardOptions = {}
): Promise<void> {
	const dataUrl = await generateShareCard(data, options);
	const link = document.createElement('a');
	link.download = filename;
	link.href = dataUrl;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

/**
 * Share using Web Share API (mobile) or download/copy on desktop
 */
export async function shareCard(
	data: ShareCardData,
	options: ShareCardOptions = {}
): Promise<boolean> {
	const dataUrl = await generateShareCard(data, options);

	const response = await fetch(dataUrl);
	const blob = await response.blob();
	const file = new File([blob], 'overdive-session.png', { type: 'image/png' });

	const canShareFiles = typeof navigator.share === 'function' &&
		typeof navigator.canShare === 'function' &&
		navigator.canShare({ files: [file] });

	if (canShareFiles) {
		try {
			await navigator.share({
				files: [file],
				title: 'My Freediving Session',
				text: `Check out my ${data.log.disciplineUsed} session!`
			});
			return true;
		} catch (error) {
			if ((error as Error).name !== 'AbortError') {
				console.error('Share failed:', error);
			}
			return false;
		}
	}

	await downloadShareCard(data, `overdive-${data.log.disciplineUsed}-session.png`, options);
	return false;
}
