/**
 * Share Card Image Generator
 * Creates a styled image from session data for social sharing
 */

import type { RoutineLog, RoutineTemplate, Discipline } from '$lib/types';
import { formatTime } from '$lib/utils/time';
import { format } from 'date-fns';

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
}

const defaultOptions: Required<ShareCardOptions> = {
	width: 1080,
	height: 1080,
	brandColor: '#14b8a6',
	secondaryColor: '#38bdf8'
};

/**
 * Get discipline color
 */
function getDisciplineColor(discipline: Discipline): string {
	const colors: Record<Discipline, string> = {
		DYN: '#14b8a6',
		DNF: '#38bdf8',
		DYNB: '#fbbf24',
		STA: '#a78bfa'
	};
	return colors[discipline] || '#14b8a6';
}

/**
 * Format the hero metric value
 */
function getHeroValue(log: RoutineLog, routine: RoutineTemplate): string {
	const metric = routine.displayConfig.heroMetric;
	
	if (metric === 'totalTime' && log.totalTime !== undefined) {
		return formatTime(log.totalTime);
	}
	if (metric === 'totalDistance' && log.totalDistance !== undefined) {
		return `${log.totalDistance}m`;
	}
	if (metric === 'repDuration' && log.repDuration !== undefined) {
		return formatTime(log.repDuration);
	}
	if (metric === 'totalRepDistance' && log.repDistance !== undefined) {
		return `${log.repDistance}m`;
	}
	return '—';
}

/**
 * Format the secondary metric value
 */
function getSecondaryValue(log: RoutineLog, routine: RoutineTemplate): string {
	const metric = routine.displayConfig.secondaryMetric;
	
	if (metric === 'totalTime' && log.totalTime !== undefined) {
		return formatTime(log.totalTime);
	}
	if (metric === 'totalDistance' && log.totalDistance !== undefined) {
		return `${log.totalDistance}m`;
	}
	if (metric === 'repDuration' && log.repDuration !== undefined) {
		return formatTime(log.repDuration);
	}
	if (metric === 'totalRepDistance' && log.repDistance !== undefined) {
		return `${log.repDistance}m`;
	}
	return '—';
}

/**
 * Draw rounded rectangle
 */
function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
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

/**
 * Generate share card image as data URL
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
	
	if (!ctx) {
		throw new Error('Could not get canvas context');
	}
	
	const disciplineColor = getDisciplineColor(log.disciplineUsed);
	const heroValue = getHeroValue(log, routine);
	const secondaryValue = getSecondaryValue(log, routine);
	const dateStr = format(log.date.toDate(), 'MMMM d, yyyy');
	
	// Background gradient
	const bgGradient = ctx.createLinearGradient(0, 0, width, height);
	bgGradient.addColorStop(0, '#0f172a');
	bgGradient.addColorStop(0.5, '#1e293b');
	bgGradient.addColorStop(1, '#0f172a');
	ctx.fillStyle = bgGradient;
	ctx.fillRect(0, 0, width, height);
	
	// Add subtle grid pattern
	ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
	ctx.lineWidth = 1;
	for (let i = 0; i < width; i += 40) {
		ctx.beginPath();
		ctx.moveTo(i, 0);
		ctx.lineTo(i, height);
		ctx.stroke();
	}
	for (let i = 0; i < height; i += 40) {
		ctx.beginPath();
		ctx.moveTo(0, i);
		ctx.lineTo(width, i);
		ctx.stroke();
	}
	
	// Card background
	const cardX = 60;
	const cardY = 60;
	const cardWidth = width - 120;
	const cardHeight = height - 120;
	
	ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
	roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 24);
	ctx.fill();
	
	// Card border
	ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
	ctx.lineWidth = 2;
	roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 24);
	ctx.stroke();
	
	// Gradient accent line at top
	const accentGradient = ctx.createLinearGradient(cardX, 0, cardX + cardWidth, 0);
	accentGradient.addColorStop(0, disciplineColor);
	accentGradient.addColorStop(0.5, '#10b981');
	accentGradient.addColorStop(1, 'transparent');
	ctx.fillStyle = accentGradient;
	roundRect(ctx, cardX, cardY, cardWidth, 6, 3);
	ctx.fill();
	
	// Discipline badge
	const badgeX = cardX + 60;
	const badgeY = cardY + 80;
	const badgeWidth = 140;
	const badgeHeight = 44;
	
	ctx.fillStyle = disciplineColor + '20';
	roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 22);
	ctx.fill();
	
	ctx.strokeStyle = disciplineColor + '60';
	ctx.lineWidth = 2;
	roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 22);
	ctx.stroke();
	
	ctx.fillStyle = disciplineColor;
	ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(log.disciplineUsed, badgeX + badgeWidth / 2, badgeY + 30);
	
	// Routine name
	ctx.fillStyle = '#f1f5f9';
	ctx.font = '600 32px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText(routine.name, cardX + 60, cardY + 170);
	
	// Date
	ctx.fillStyle = '#94a3b8';
	ctx.font = '400 24px system-ui, -apple-system, sans-serif';
	ctx.fillText(dateStr, cardX + 60, cardY + 210);
	
	// Hero metric (centered, large)
	const heroLabel = routine.displayConfig.heroMetricLabel || 'Result';
	const heroY = height / 2 - 20;
	
	ctx.fillStyle = '#94a3b8';
	ctx.font = '500 20px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.letterSpacing = '0.1em';
	ctx.fillText(heroLabel.toUpperCase(), width / 2, heroY - 60);
	
	// Hero value with gradient
	ctx.font = 'bold 120px system-ui, -apple-system, sans-serif';
	const heroGradient = ctx.createLinearGradient(0, heroY - 80, 0, heroY + 40);
	heroGradient.addColorStop(0, disciplineColor);
	heroGradient.addColorStop(1, '#10b981');
	ctx.fillStyle = heroGradient;
	ctx.fillText(heroValue, width / 2, heroY + 40);
	
	// Secondary metrics row
	const metricsY = heroY + 140;
	const metricBoxWidth = 200;
	const metricBoxHeight = 100;
	const metricSpacing = 40;
	const totalMetricsWidth = metricBoxWidth * 3 + metricSpacing * 2;
	const metricsStartX = (width - totalMetricsWidth) / 2;
	
	// Secondary metric
	drawMetricBox(
		ctx,
		metricsStartX,
		metricsY,
		metricBoxWidth,
		metricBoxHeight,
		routine.displayConfig.secondaryMetricLabel || 'Secondary',
		secondaryValue
	);
	
	// RPE
	drawMetricBox(
		ctx,
		metricsStartX + metricBoxWidth + metricSpacing,
		metricsY,
		metricBoxWidth,
		metricBoxHeight,
		'💪 RPE',
		log.rpe !== undefined ? String(log.rpe) : '—'
	);
	
	// Joy
	drawMetricBox(
		ctx,
		metricsStartX + (metricBoxWidth + metricSpacing) * 2,
		metricsY,
		metricBoxWidth,
		metricBoxHeight,
		'😊 Joy',
		log.joyScale !== undefined ? String(log.joyScale) : '—'
	);
	
	// User name at bottom
	if (userName) {
		ctx.fillStyle = '#94a3b8';
		ctx.font = '400 24px system-ui, -apple-system, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(`@${userName}`, width / 2, height - 120);
	}
	
	// Branding
	ctx.fillStyle = '#64748b';
	ctx.font = '500 20px system-ui, -apple-system, sans-serif';
	ctx.fillText('overdive.app', width / 2, height - 80);
	
	return canvas.toDataURL('image/png');
}

/**
 * Helper to draw a metric box
 */
function drawMetricBox(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	label: string,
	value: string
): void {
	// Box background
	ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
	roundRect(ctx, x, y, width, height, 12);
	ctx.fill();
	
	// Box border
	ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
	ctx.lineWidth = 1;
	roundRect(ctx, x, y, width, height, 12);
	ctx.stroke();
	
	// Label
	ctx.fillStyle = '#94a3b8';
	ctx.font = '500 16px system-ui, -apple-system, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(label.toUpperCase(), x + width / 2, y + 35);
	
	// Value
	ctx.fillStyle = '#f1f5f9';
	ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
	ctx.fillText(value, x + width / 2, y + 75);
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
 * Share using Web Share API (mobile)
 */
export async function shareCard(
	data: ShareCardData,
	options: ShareCardOptions = {}
): Promise<boolean> {
	const dataUrl = await generateShareCard(data, options);
	
	// Convert data URL to blob
	const response = await fetch(dataUrl);
	const blob = await response.blob();
	const file = new File([blob], 'overdive-session.png', { type: 'image/png' });
	
	if (navigator.share && navigator.canShare?.({ files: [file] })) {
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
	
	// Fallback to download
	await downloadShareCard(data, 'overdive-session.png', options);
	return false;
}
