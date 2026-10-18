/**
 * Output sizing for server-burned exports. Shared by the web app and the
 * Cloud Functions bundle, so keep it free of imports.
 */

export interface PixelSize {
	readonly width: number;
	readonly height: number;
}

/** Short edge of burned HUD exports (portrait 1080×1920-ish, landscape 1920×1080-ish). */
export const OVERLAY_EXPORT_SHORT_EDGE_PX = 1080;

/** Round to the nearest even pixel count (H.264 with yuv420p needs even sizes), minimum 2. */
export function evenPx(value: number): number {
	const rounded = Math.max(2, Math.round(value));
	return rounded % 2 === 0 ? rounded : rounded - 1;
}

/** Scale a display size so its shorter edge equals `shortEdgePx`, keeping the aspect ratio. */
export function scaleToShortEdge(size: PixelSize, shortEdgePx: number): PixelSize {
	const ratio = shortEdgePx / Math.min(size.width, size.height);
	return { width: evenPx(size.width * ratio), height: evenPx(size.height * ratio) };
}
