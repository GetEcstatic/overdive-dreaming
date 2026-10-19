/**
 * Style version for server-burned HUD exports. Shared by the web app and the
 * Cloud Functions bundle: bump it whenever the burned HUD's appearance changes
 * so stale `overlay-download` artifacts are regenerated.
 *
 * Keep this file free of imports so the functions bundle can include it.
 */
export const SERVER_OVERLAY_STYLE_VERSION = 'overdive-overlay-v18';

/**
 * Key stamped on an `overlay-download` artifact: the style version plus the
 * user's share edits that change the burned pixels. An export is current only
 * when its key matches the video's.
 */
export function overlayRenderKey(video: { readonly shareEdit?: { readonly firstLengthDirection?: string } | null }): string {
	return video.shareEdit?.firstLengthDirection === 'rtl' ? `${SERVER_OVERLAY_STYLE_VERSION}+rtl` : SERVER_OVERLAY_STYLE_VERSION;
}

/** Style version for the social cut (edit rules, canvas, extras). Bump with any change to them. */
export const SOCIAL_CUT_STYLE_VERSION = 'overdive-social-v1';

/** What the owner chose to show on the social cut (`UserSettings.shareHud`). */
export interface SocialCutRenderOptions {
	readonly showName: boolean;
	readonly showPb: boolean;
	readonly hook: boolean;
}

export const DEFAULT_SOCIAL_CUT_OPTIONS: SocialCutRenderOptions = { showName: true, showPb: true, hook: true };

/**
 * Key stamped on a `social-cut` artifact: the HUD style, the social cut
 * style, the graph direction, the protocol-end override and the toggles. The
 * app and the worker both compute it, so "is this cut current?" has one answer.
 */
export function socialRenderKey(
	video: { readonly shareEdit?: { readonly firstLengthDirection?: string; readonly protocolEndMs?: number | null } | null },
	options: SocialCutRenderOptions
): string {
	const override = video.shareEdit?.protocolEndMs;
	const protocol = typeof override === 'number' ? `pe${Math.round(override / 100) * 100}` : 'pe-auto';
	const flags = `n${options.showName ? 1 : 0}p${options.showPb ? 1 : 0}h${options.hook ? 1 : 0}`;
	return `${SOCIAL_CUT_STYLE_VERSION}/${overlayRenderKey(video)}|${protocol}|${flags}`;
}
