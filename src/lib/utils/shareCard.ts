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
	
	const padding = 48;
	const contentWidth = width - padding * 2;
	
	// === BACKGROUND ===
	if (sessionPhoto) {
		// Draw photo covering top ~55% with graduated overlay
		const imgAspect = sessionPhoto.width / sessionPhoto.height;
		const canvasAspect = width / height;
		
		let drawWidth, drawHeight, drawX, drawY;
		if (imgAspect > canvasAspect) {
			drawHeight = height;
			drawWidth = drawHeight * imgAspect;
			drawX = (width - drawWidth) / 2;
			drawY = 0;
		} else {
			drawWidth = width;
			drawHeight = drawWidth / imgAspect;
			drawX = 0;
			drawY = (height - drawHeight) / 2;
		}
		
		ctx.drawImage(sessionPhoto, drawX, drawY, drawWidth, drawHeight);
		
		// Graduated overlay: light at top, heavy at bottom
		const overlay = ctx.createLinearGradient(0, 0, 0, height);
		overlay.addColorStop(0, 'rgba(10, 22, 40, 0.25)');
		overlay.addColorStop(0.4, 'rgba(10, 22, 40, 0.45)');
		overlay.addColorStop(0.55, 'rgba(10, 22, 40, 0.75)');
		overlay.addColorStop(0.7, 'rgba(10, 22, 40, 0.92)');
		overlay.addColorStop(1, 'rgba(10, 22, 40, 0.98)');
		ctx.fillStyle = overlay;
		ctx.fillRect(0, 0, width, height);
	} else {
		// Deep ocean gradient background
		const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
		bgGradient.addColorStop(0, '#0a1628');
		bgGradient.addColorStop(0.4, '#0d2847');
		bgGradient.addColorStop(0.7, '#0a1e3a');
		bgGradient.addColorStop(1, '#060e1a');
		ctx.fillStyle = bgGradient;
		ctx.fillRect(0, 0, width, height);
		
		// Subtle radial glow in center
		const glow = ctx.createRadialGradient(width / 2, height * 0.35, 0, width / 2, height * 0.35, width * 0.8);
		glow.addColorStop(0, disciplineColor + '12');
		glow.addColorStop(0.5, disciplineColor + '06');
		glow.addColorStop(1, 'transparent');
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, width, height);
	}
	
	// === TOP SECTION: Discipline badge ===
	const topY = format === 'story' ? 80 : 100;
	
	// Discipline badge with glow
	const badgeText = log.disciplineUsed;
	ctx.font = `bold 28px system-ui, -apple-system, sans-serif`;
	const badgeTextWidth = ctx.measureText(badgeText).width;
	const badgePadH = 36;
	const badgePadV = 16;
	const badgeW = badgeTextWidth + badgePadH * 2;
	const badgeH = 52;
	const badgeX = padding;
	const badgeY = topY;
	
	// Glow behind badge
	ctx.shadowColor = disciplineColor;
	ctx.shadowBlur = 30;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;
	
	ctx.fillStyle = disciplineColor + '35';
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
	
	// Date top-right
	ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
	ctx.font = `400 26px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'right';
	ctx.fillText(dateStr, width - padding, badgeY + 36);
	
	// Routine name below badge
	const routineY = badgeY + badgeH + 40;
	ctx.fillStyle = '#ffffff';
	ctx.font = `600 40px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'left';
	
	let routineName = routine.name;
	const maxRoutineWidth = contentWidth;
	while (ctx.measureText(routineName).width > maxRoutineWidth && routineName.length > 10) {
		routineName = routineName.slice(0, -4) + '...';
	}
	ctx.fillText(routineName, padding, routineY);
	
	// Thin accent separator
	const separatorY = routineY + 24;
	const sepGradient = ctx.createLinearGradient(padding, 0, padding + 200, 0);
	sepGradient.addColorStop(0, disciplineColor + '80');
	sepGradient.addColorStop(1, 'transparent');
	ctx.fillStyle = sepGradient;
	ctx.fillRect(padding, separatorY, 200, 2);
	
	// === HERO METRIC - Big centerpiece ===
	const heroLabel = routine.displayConfig.heroMetricLabel || 'Result';
	const heroCenterY = format === 'story' ? height * 0.40 : height * 0.45;
	
	// Hero label
	ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
	ctx.font = `500 22px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.letterSpacing = '3px';
	ctx.fillText(heroLabel.toUpperCase(), width / 2, heroCenterY - 80);
	ctx.letterSpacing = '0px';
	
	// Hero value with glow
	const heroFontSize = format === 'story' ? 150 : 120;
	ctx.font = `bold ${heroFontSize}px system-ui, -apple-system, sans-serif`;
	
	// Glow behind hero
	ctx.shadowColor = disciplineColor;
	ctx.shadowBlur = 40;
	
	const heroGradient = ctx.createLinearGradient(0, heroCenterY - 60, 0, heroCenterY + 30);
	heroGradient.addColorStop(0, '#ffffff');
	heroGradient.addColorStop(0.6, disciplineColor);
	heroGradient.addColorStop(1, '#10b981');
	ctx.fillStyle = heroGradient;
	ctx.fillText(heroValue, width / 2, heroCenterY + 20);
	
	ctx.shadowBlur = 0;
	
	// === FROSTED GLASS METRICS PANEL ===
	const panelY = format === 'story' ? height * 0.54 : height * 0.58;
	const panelHeight = format === 'story' ? 310 : 260;
	
	drawGlassPanel(ctx, padding, panelY, contentWidth, panelHeight, 24, 0.06);
	
	const panelPad = 32;
	const innerWidth = contentWidth - panelPad * 2;
	
	// Secondary metric inside panel
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
	
	// Thin divider
	const divY = secY + 80;
	const divGradient = ctx.createLinearGradient(padding + panelPad, 0, padding + panelPad + innerWidth, 0);
	divGradient.addColorStop(0, 'transparent');
	divGradient.addColorStop(0.2, 'rgba(255,255,255,0.15)');
	divGradient.addColorStop(0.8, 'rgba(255,255,255,0.15)');
	divGradient.addColorStop(1, 'transparent');
	ctx.fillStyle = divGradient;
	ctx.fillRect(padding + panelPad, divY, innerWidth, 1);
	
	// RPE and Joy side by side below divider
	const statsY = divY + 45;
	const halfW = innerWidth / 2;
	const leftCenterX = padding + panelPad + halfW / 2;
	const rightCenterX = padding + panelPad + halfW + halfW / 2;
	
	// RPE
	ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
	ctx.font = `500 18px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center';
	ctx.letterSpacing = '2px';
	ctx.fillText('RPE', leftCenterX, statsY);
	ctx.letterSpacing = '0px';
	
	ctx.fillStyle = '#f1f5f9';
	ctx.font = `bold 42px system-ui, -apple-system, sans-serif`;
	ctx.fillText(log.rpe !== undefined ? String(log.rpe) : '—', leftCenterX, statsY + 50);
	
	// Vertical divider between RPE and Joy
	ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
	ctx.fillRect(padding + panelPad + halfW - 0.5, statsY - 15, 1, 75);
	
	// Joy
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
		const notesY = panelY + panelHeight + 50;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
		ctx.font = `italic 24px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(`"${notesFirstLine}"`, width / 2, notesY);
	}
	
	// === BOTTOM: Username + Branding ===
	const bottomY = height - 120;
	
	if (userName) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		ctx.font = `400 28px system-ui, -apple-system, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText(`@${userName}`, width / 2, bottomY);
	}
	
	// Branding with discipline accent
	ctx.fillStyle = disciplineColor + '80';
	ctx.font = `500 22px system-ui, -apple-system, sans-serif`;
	ctx.fillText('overdive.app', width / 2, bottomY + 40);
	
	// Bottom accent glow line
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
