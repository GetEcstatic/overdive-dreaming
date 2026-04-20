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
 * Draw a frosted glass panel
 */
function drawGlassPanel(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	radius: number = 24,
	opacity: number = 0.08
): void {
	// Glass fill
	ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
	roundRect(ctx, x, y, w, h, radius);
	ctx.fill();
	// Subtle border
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
	ctx.lineWidth = 1;
	roundRect(ctx, x, y, w, h, radius);
	ctx.stroke();
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
	const dateStr = formatDate(log.date.toDate(), 'MMM d, yyyy');
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
	
	const padding = 40;
	const contentWidth = width - padding * 2;
	
	// === SOLID DARK BACKGROUND (entire card) ===
	const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
	bgGradient.addColorStop(0, '#0a1628');
	bgGradient.addColorStop(0.5, '#0d2040');
	bgGradient.addColorStop(1, '#060e1a');
	ctx.fillStyle = bgGradient;
	ctx.fillRect(0, 0, width, height);
	
	// Subtle radial glow
	const glow = ctx.createRadialGradient(width / 2, height * 0.25, 0, width / 2, height * 0.25, width * 0.7);
	glow.addColorStop(0, disciplineColor + '0a');
	glow.addColorStop(1, 'transparent');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, width, height);
	
	let currentY = padding;
	
	// === PHOTO SECTION (if available) - rounded box at top ===
	if (sessionPhoto) {
		const photoBoxHeight = height * 0.38;
		const photoBoxRadius = 24;
		
		// Clip to rounded rect and draw photo
		ctx.save();
		roundRect(ctx, padding, currentY, contentWidth, photoBoxHeight, photoBoxRadius);
		ctx.clip();
		
		const imgAspect = sessionPhoto.width / sessionPhoto.height;
		const boxAspect = contentWidth / photoBoxHeight;
		
		let drawWidth, drawHeight, drawX, drawY;
		if (imgAspect > boxAspect) {
			drawHeight = photoBoxHeight;
			drawWidth = drawHeight * imgAspect;
			drawX = padding + (contentWidth - drawWidth) / 2;
			drawY = currentY;
		} else {
			drawWidth = contentWidth;
			drawHeight = drawWidth / imgAspect;
			drawX = padding;
			drawY = currentY + (photoBoxHeight - drawHeight) / 2;
		}
		
		ctx.drawImage(sessionPhoto, drawX, drawY, drawWidth, drawHeight);
		
		// Light overlay at bottom of photo for transition
		const photoOverlay = ctx.createLinearGradient(0, currentY + photoBoxHeight * 0.6, 0, currentY + photoBoxHeight);
		photoOverlay.addColorStop(0, 'rgba(10, 22, 40, 0)');
		photoOverlay.addColorStop(1, 'rgba(10, 22, 40, 0.5)');
		ctx.fillStyle = photoOverlay;
		ctx.fillRect(padding, currentY, contentWidth, photoBoxHeight);
		
		ctx.restore();
		
		// Discipline badge overlapping bottom-left of photo
		const badgeText = log.disciplineUsed;
		ctx.font = `bold 24px system-ui, -apple-system, sans-serif`;
		const badgeTextW = ctx.measureText(badgeText).width;
		const badgeW = badgeTextW + 48;
		const badgeH = 44;
		const badgeX = padding + 20;
		const badgeY = currentY + photoBoxHeight - badgeH / 2;
		
		ctx.fillStyle = disciplineColor;
		roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
		ctx.fill();
		
		ctx.fillStyle = '#ffffff';
		ctx.font = `bold 24px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 30);
		
		// Date overlapping bottom-right of photo
		ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
		ctx.font = `400 22px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'right';
		ctx.fillText(dateStr, width - padding - 20, badgeY + 30);
		
		currentY += photoBoxHeight + 32;
	} else {
		// No photo: discipline badge and date at top
		const badgeText = log.disciplineUsed;
		ctx.font = `bold 28px system-ui, -apple-system, sans-serif`;
		const badgeTextW = ctx.measureText(badgeText).width;
		const badgeW = badgeTextW + 56;
		const badgeH = 52;
		const badgeX = padding;
		const badgeY = currentY + 40;
		
		ctx.shadowColor = disciplineColor;
		ctx.shadowBlur = 25;
		ctx.fillStyle = disciplineColor + '40';
		roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
		ctx.fill();
		ctx.shadowBlur = 0;
		
		ctx.strokeStyle = disciplineColor + '70';
		ctx.lineWidth = 1.5;
		roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
		ctx.stroke();
		
		ctx.fillStyle = '#ffffff';
		ctx.font = `bold 28px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 36);
		
		ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		ctx.font = `400 26px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'right';
		ctx.fillText(dateStr, width - padding, badgeY + 36);
		
		currentY = badgeY + badgeH + 40;
	}
	
	// === ROUTINE NAME ===
	ctx.fillStyle = '#ffffff';
	ctx.font = `600 38px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'left';
	
	let routineName = routine.name;
	while (ctx.measureText(routineName).width > contentWidth && routineName.length > 10) {
		routineName = routineName.slice(0, -4) + '...';
	}
	ctx.fillText(routineName, padding, currentY);
	
	// Accent line under routine name
	currentY += 20;
	const sepGradient = ctx.createLinearGradient(padding, 0, padding + 180, 0);
	sepGradient.addColorStop(0, disciplineColor);
	sepGradient.addColorStop(1, 'transparent');
	ctx.fillStyle = sepGradient;
	ctx.fillRect(padding, currentY, 180, 3);
	
	currentY += 40;
	
	// === HERO METRIC ===
	const heroLabel = routine.displayConfig.heroMetricLabel || 'Result';
	
	ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
	ctx.font = `500 20px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.letterSpacing = '3px';
	ctx.fillText(heroLabel.toUpperCase(), width / 2, currentY);
	ctx.letterSpacing = '0px';
	
	currentY += 10;
	
	const heroFontSize = sessionPhoto ? 120 : 150;
	ctx.font = `bold ${heroFontSize}px system-ui, -apple-system, sans-serif`;
	
	// Glow behind hero
	ctx.shadowColor = disciplineColor;
	ctx.shadowBlur = 35;
	
	const heroGradient = ctx.createLinearGradient(0, currentY, 0, currentY + heroFontSize * 0.8);
	heroGradient.addColorStop(0, '#ffffff');
	heroGradient.addColorStop(0.7, disciplineColor);
	heroGradient.addColorStop(1, '#10b981');
	ctx.fillStyle = heroGradient;
	ctx.fillText(heroValue, width / 2, currentY + heroFontSize * 0.8);
	
	ctx.shadowBlur = 0;
	currentY += heroFontSize * 0.85 + 40;
	
	// === METRICS PANEL (solid background, high contrast) ===
	const panelHeight = 260;
	const panelY = currentY;
	
	// Solid dark panel with slight transparency
	ctx.fillStyle = 'rgba(8, 16, 32, 0.85)';
	roundRect(ctx, padding, panelY, contentWidth, panelHeight, 20);
	ctx.fill();
	
	// Subtle border
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
	ctx.lineWidth = 1;
	roundRect(ctx, padding, panelY, contentWidth, panelHeight, 20);
	ctx.stroke();
	
	const panelPad = 32;
	const innerWidth = contentWidth - panelPad * 2;
	
	// Secondary metric
	const secY = panelY + 50;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
	ctx.font = `500 18px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.letterSpacing = '2px';
	ctx.fillText((routine.displayConfig.secondaryMetricLabel || 'Secondary').toUpperCase(), width / 2, secY);
	ctx.letterSpacing = '0px';
	
	ctx.fillStyle = '#f1f5f9';
	ctx.font = `bold 48px system-ui, -apple-system, sans-serif`;
	ctx.fillText(secondaryValue, width / 2, secY + 55);
	
	// Divider
	const divY = secY + 80;
	const divGradient = ctx.createLinearGradient(padding + panelPad, 0, padding + panelPad + innerWidth, 0);
	divGradient.addColorStop(0, 'transparent');
	divGradient.addColorStop(0.2, 'rgba(255,255,255,0.12)');
	divGradient.addColorStop(0.8, 'rgba(255,255,255,0.12)');
	divGradient.addColorStop(1, 'transparent');
	ctx.fillStyle = divGradient;
	ctx.fillRect(padding + panelPad, divY, innerWidth, 1);
	
	// RPE and Joy
	const statsY = divY + 45;
	const halfW = innerWidth / 2;
	const leftCenterX = padding + panelPad + halfW / 2;
	const rightCenterX = padding + panelPad + halfW + halfW / 2;
	
	ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
	ctx.font = `500 18px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.letterSpacing = '2px';
	ctx.fillText('RPE', leftCenterX, statsY);
	ctx.letterSpacing = '0px';
	
	ctx.fillStyle = '#f1f5f9';
	ctx.font = `bold 42px system-ui, -apple-system, sans-serif`;
	ctx.fillText(log.rpe !== undefined ? String(log.rpe) : '—', leftCenterX, statsY + 50);
	
	// Vertical divider
	ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
	ctx.fillRect(padding + panelPad + halfW - 0.5, statsY - 15, 1, 75);
	
	ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
	ctx.font = `500 18px system-ui, -apple-system, sans-serif`;
	ctx.letterSpacing = '2px';
	ctx.fillText('JOY', rightCenterX, statsY);
	ctx.letterSpacing = '0px';
	
	ctx.fillStyle = '#f1f5f9';
	ctx.font = `bold 42px system-ui, -apple-system, sans-serif`;
	ctx.fillText(log.joyScale !== undefined ? String(log.joyScale) : '—', rightCenterX, statsY + 50);
	
	// === NOTES ===
	if (notesFirstLine) {
		const notesY = panelY + panelHeight + 45;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
		ctx.font = `italic 24px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(`"${notesFirstLine}"`, width / 2, notesY);
	}
	
	// === BOTTOM: Username + Branding ===
	const bottomY = height - 100;
	
	if (userName) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		ctx.font = `400 26px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(`@${userName}`, width / 2, bottomY);
	}
	
	ctx.fillStyle = disciplineColor + '80';
	ctx.font = `500 20px system-ui, -apple-system, sans-serif`;
	ctx.fillText('overdive.app', width / 2, bottomY + 36);
	
	// Bottom accent line
	const bottomGlow = ctx.createLinearGradient(0, 0, width, 0);
	bottomGlow.addColorStop(0, 'transparent');
	bottomGlow.addColorStop(0.3, disciplineColor + '50');
	bottomGlow.addColorStop(0.5, disciplineColor + '80');
	bottomGlow.addColorStop(0.7, disciplineColor + '50');
	bottomGlow.addColorStop(1, 'transparent');
	ctx.fillStyle = bottomGlow;
	ctx.fillRect(0, height - 3, width, 3);
	
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
