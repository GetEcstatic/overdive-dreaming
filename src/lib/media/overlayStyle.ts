/**
 * Style version for server-burned HUD exports. Shared by the web app and the
 * Cloud Functions bundle: bump it whenever the burned HUD's appearance changes
 * so stale `overlay-download` artifacts are regenerated.
 *
 * Keep this file free of imports so the functions bundle can include it.
 */
export const SERVER_OVERLAY_STYLE_VERSION = 'overdive-overlay-v17';

/**
 * Key stamped on an `overlay-download` artifact: the style version plus the
 * user's share edits that change the burned pixels. An export is current only
 * when its key matches the video's.
 */
export function overlayRenderKey(video: { readonly shareEdit?: { readonly firstLengthDirection?: string } | null }): string {
	return video.shareEdit?.firstLengthDirection === 'rtl' ? `${SERVER_OVERLAY_STYLE_VERSION}+rtl` : SERVER_OVERLAY_STYLE_VERSION;
}
