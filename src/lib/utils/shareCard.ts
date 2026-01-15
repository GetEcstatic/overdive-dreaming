/**
 * Share Card Image Generator
 * Creates a styled image from session data for social sharing
 */

import type { RoutineLog, RoutineTemplate, Discipline } from '$lib/types';
import { formatTime } from '$lib/utils/time';
import { format as formatDate } from 'date-fns';

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
	format?: 'square' | 'story'; // 'story' = 9:16 aspect ratio for Instagram
}

const defaultOptions: Required<ShareCardOptions> = {
	width: 1080,
	height: 1920, // 9:16 aspect ratio for Instagram stories
	brandColor: '#14b8a6',
	secondaryColor: '#38bdf8',
	format: 'story'
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
 * Load an image from URL and return it as an HTMLImageElement
 * Uses fetch to handle CORS properly for Firebase Storage URLs
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise(async (resolve, reject) => {
		try {
			// For Firebase Storage URLs, fetch as blob first to handle CORS
			const response = await fetch(url, { mode: 'cors' });
			if (!response.ok) {
				throw new Error(`Failed to fetch image: ${response.status}`);
			}
			const blob = await response.blob();
			const objectUrl = URL.createObjectURL(blob);
			
			const img = new Image();
			img.onload = () => {
				// Clean up the object URL after image loads
				URL.revokeObjectURL(objectUrl);
				resolve(img);
			};
			img.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				reject(new Error('Failed to load image from blob'));
			};
			img.src = objectUrl;
		} catch (error) {
			// Fallback: try loading directly with crossOrigin
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = () => reject(error);
			img.src = url;
		}
	});
}

/**
 * Get first line of notes (for share card)
 */
function getFirstLine(notes?: string): string | null {
	if (!notes) return null;
	const trimmed = notes.trim();
	const firstLine = trimmed.split('\n')[0].trim();
	if (firstLine.length > 80) {
		return firstLine.slice(0, 77) + '...';
	}
	return firstLine || null;
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
	const { width, height, format } = opts;
	
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
	const dateStr = format === 'story' 
		? formatDate(log.date.toDate(), 'MMM d, yyyy')
		: formatDate(log.date.toDate(), 'MMMM d, yyyy');
	const notesFirstLine = getFirstLine(log.notes);
	
	// Try to load session photo
	let sessionPhoto: HTMLImageElement | null = null;
	const photoUrl = log.photoUrl || log.thumbnailImageUrl;
	if (photoUrl) {
		try {
			sessionPhoto = await loadImage(photoUrl);
		} catch (e) {
			console.warn('Failed to load session photo for share card:', e);
		}
	}
	
	// Padding for content
	const padding = format === 'story' ? 40 : 60;
	const contentWidth = width - padding * 2;
	
	// === BACKGROUND ===
	if (sessionPhoto && format === 'story') {
		// Draw photo as background with gradient overlay
		const imgAspect = sessionPhoto.width / sessionPhoto.height;
		const canvasAspect = width / height;
		
		let drawWidth, drawHeight, drawX, drawY;
		if (imgAspect > canvasAspect) {
			// Image is wider - fit height
			drawHeight = height;
			drawWidth = drawHeight * imgAspect;
			drawX = (width - drawWidth) / 2;
			drawY = 0;
		} else {
			// Image is taller - fit width
			drawWidth = width;
			drawHeight = drawWidth / imgAspect;
			drawX = 0;
			drawY = (height - drawHeight) / 2;
		}
		
		ctx.drawImage(sessionPhoto, drawX, drawY, drawWidth, drawHeight);
		
		// Simple black overlay for readability (50% opacity)
		ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
		ctx.fillRect(0, 0, width, height);
	} else {
		// Solid gradient background
		const bgGradient = ctx.createLinearGradient(0, 0, width, height);
		bgGradient.addColorStop(0, '#0f172a');
		bgGradient.addColorStop(0.3, '#1e293b');
		bgGradient.addColorStop(0.7, '#1e293b');
		bgGradient.addColorStop(1, '#0f172a');
		ctx.fillStyle = bgGradient;
		ctx.fillRect(0, 0, width, height);
		
		// Subtle grid pattern
		ctx.strokeStyle = 'rgba(148, 163, 184, 0.03)';
		ctx.lineWidth = 1;
		const gridSize = format === 'story' ? 60 : 40;
		for (let i = 0; i < width; i += gridSize) {
			ctx.beginPath();
			ctx.moveTo(i, 0);
			ctx.lineTo(i, height);
			ctx.stroke();
		}
		for (let i = 0; i < height; i += gridSize) {
			ctx.beginPath();
			ctx.moveTo(0, i);
			ctx.lineTo(width, i);
			ctx.stroke();
		}
	}
	
	// Top gradient accent line
	const accentGradient = ctx.createLinearGradient(0, 0, width, 0);
	accentGradient.addColorStop(0, 'transparent');
	accentGradient.addColorStop(0.2, disciplineColor);
	accentGradient.addColorStop(0.5, '#10b981');
	accentGradient.addColorStop(0.8, disciplineColor);
	accentGradient.addColorStop(1, 'transparent');
	ctx.fillStyle = accentGradient;
	ctx.fillRect(0, 0, width, 6);
	
	// === TOP SECTION: Discipline + Routine Info ===
	const topY = format === 'story' ? 80 : 100;
	
	// Discipline badge
	const badgeWidth = format === 'story' ? 180 : 140;
	const badgeHeight = format === 'story' ? 56 : 44;
	const badgeX = (width - badgeWidth) / 2;
	const badgeY = topY;
	
	ctx.fillStyle = disciplineColor + '40';
	roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
	ctx.fill();
	
	ctx.strokeStyle = disciplineColor + '80';
	ctx.lineWidth = 2;
	roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
	ctx.stroke();
	
	ctx.fillStyle = '#ffffff';
	ctx.font = `bold ${format === 'story' ? 32 : 24}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.fillText(log.disciplineUsed, width / 2, badgeY + (format === 'story' ? 38 : 30));
	
	// Routine name
	const routineY = badgeY + badgeHeight + (format === 'story' ? 50 : 40);
	ctx.fillStyle = '#ffffff';
	ctx.font = `600 ${format === 'story' ? 44 : 32}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	
	let routineName = routine.name;
	const maxRoutineWidth = contentWidth - 40;
	while (ctx.measureText(routineName).width > maxRoutineWidth && routineName.length > 10) {
		routineName = routineName.slice(0, -4) + '...';
	}
	ctx.fillText(routineName, width / 2, routineY);
	
	// Date
	const dateY = routineY + (format === 'story' ? 45 : 35);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
	ctx.font = `400 ${format === 'story' ? 28 : 24}px system-ui, -apple-system, sans-serif`;
	ctx.fillText(dateStr, width / 2, dateY);
	
	// === HERO METRIC SECTION ===
	const heroLabel = routine.displayConfig.heroMetricLabel || 'Result';
	const heroSectionY = format === 'story' ? height * 0.36 : height / 2 - 40;
	
	ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
	ctx.font = `500 ${format === 'story' ? 24 : 20}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.fillText(heroLabel.toUpperCase(), width / 2, heroSectionY);
	
	// Hero value with gradient
	const heroFontSize = format === 'story' ? 160 : 120;
	ctx.font = `bold ${heroFontSize}px system-ui, -apple-system, sans-serif`;
	const heroGradient = ctx.createLinearGradient(0, heroSectionY, 0, heroSectionY + heroFontSize);
	heroGradient.addColorStop(0, disciplineColor);
	heroGradient.addColorStop(1, '#10b981');
	ctx.fillStyle = heroGradient;
	ctx.fillText(heroValue, width / 2, heroSectionY + heroFontSize * 0.85);
	
	// === SECONDARY METRICS SECTION ===
	const metricsY = format === 'story' ? height * 0.56 : heroSectionY + heroFontSize + 60;
	const metricBoxWidth = format === 'story' ? 300 : 200;
	const metricBoxHeight = format === 'story' ? 120 : 100;
	const metricSpacing = format === 'story' ? 30 : 40;
	
	if (format === 'story') {
		// Secondary metric (full width box)
		const secondaryBoxWidth = metricBoxWidth * 1.5;
		drawMetricBox(
			ctx,
			(width - secondaryBoxWidth) / 2,
			metricsY,
			secondaryBoxWidth,
			metricBoxHeight,
			routine.displayConfig.secondaryMetricLabel || 'Secondary',
			secondaryValue,
			true
		);
		
		// RPE and Joy side by side
		const rpeJoyY = metricsY + metricBoxHeight + metricSpacing;
		const smallBoxWidth = (contentWidth - metricSpacing) / 2;
		
		drawMetricBox(ctx, padding, rpeJoyY, smallBoxWidth, metricBoxHeight,
			'💪 RPE', log.rpe !== undefined ? String(log.rpe) : '—', true);
		
		drawMetricBox(ctx, padding + smallBoxWidth + metricSpacing, rpeJoyY, smallBoxWidth, metricBoxHeight,
			'😊 Joy', log.joyScale !== undefined ? String(log.joyScale) : '—', true);
		
		// === NOTES SECTION (first line) ===
		if (notesFirstLine) {
			const notesY = rpeJoyY + metricBoxHeight + (format === 'story' ? 60 : 40);
			ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
			ctx.font = `italic ${format === 'story' ? 26 : 20}px system-ui, -apple-system, sans-serif`;
			ctx.textAlign = 'center';
			ctx.fillText(`"${notesFirstLine}"`, width / 2, notesY);
		}
	} else {
		// Square format: all three in a row
		const totalMetricsWidth = metricBoxWidth * 3 + metricSpacing * 2;
		const metricsStartX = (width - totalMetricsWidth) / 2;
		
		drawMetricBox(ctx, metricsStartX, metricsY, metricBoxWidth, metricBoxHeight,
			routine.displayConfig.secondaryMetricLabel || 'Secondary', secondaryValue, false);
		
		drawMetricBox(ctx, metricsStartX + metricBoxWidth + metricSpacing, metricsY, metricBoxWidth, metricBoxHeight,
			'💪 RPE', log.rpe !== undefined ? String(log.rpe) : '—', false);
		
		drawMetricBox(ctx, metricsStartX + (metricBoxWidth + metricSpacing) * 2, metricsY, metricBoxWidth, metricBoxHeight,
			'😊 Joy', log.joyScale !== undefined ? String(log.joyScale) : '—', false);
	}
	
	// === BOTTOM SECTION: User name + Branding ===
	const bottomY = height - (format === 'story' ? 160 : 120);
	
	if (userName) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
		ctx.font = `400 ${format === 'story' ? 32 : 24}px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(`@${userName}`, width / 2, bottomY);
	}
	
	// Branding
	ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
	ctx.font = `500 ${format === 'story' ? 26 : 20}px system-ui, -apple-system, sans-serif`;
	ctx.fillText('overdive.app', width / 2, bottomY + (format === 'story' ? 50 : 40));
	
	// Bottom accent line
	const bottomAccentGradient = ctx.createLinearGradient(0, 0, width, 0);
	bottomAccentGradient.addColorStop(0, 'transparent');
	bottomAccentGradient.addColorStop(0.2, disciplineColor + '60');
	bottomAccentGradient.addColorStop(0.5, '#10b981' + '60');
	bottomAccentGradient.addColorStop(0.8, disciplineColor + '60');
	bottomAccentGradient.addColorStop(1, 'transparent');
	ctx.fillStyle = bottomAccentGradient;
	ctx.fillRect(0, height - 4, width, 4);
	
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
	value: string,
	large: boolean = false
): void {
	// Box background
	ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
	roundRect(ctx, x, y, width, height, large ? 16 : 12);
	ctx.fill();
	
	// Box border
	ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
	ctx.lineWidth = 1;
	roundRect(ctx, x, y, width, height, large ? 16 : 12);
	ctx.stroke();
	
	// Label
	ctx.fillStyle = '#94a3b8';
	ctx.font = `500 ${large ? 20 : 16}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.fillText(label.toUpperCase(), x + width / 2, y + (large ? 40 : 35));
	
	// Value
	ctx.fillStyle = '#f1f5f9';
	ctx.font = `bold ${large ? 44 : 32}px system-ui, -apple-system, sans-serif`;
	ctx.fillText(value, x + width / 2, y + (large ? 90 : 75));
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
	
	// Convert data URL to blob
	const response = await fetch(dataUrl);
	const blob = await response.blob();
	const file = new File([blob], 'overdive-session.png', { type: 'image/png' });
	
	// Check if mobile-style sharing with files is available
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
	
	// Desktop fallback: always download the file
	await downloadShareCard(data, `overdive-${data.log.disciplineUsed}-session.png`, options);
	return false;
}
