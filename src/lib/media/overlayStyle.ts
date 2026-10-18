/**
 * Style version for server-burned HUD exports. Shared by the web app and the
 * Cloud Functions bundle: bump it whenever the burned HUD's appearance changes
 * so stale `overlay-download` artifacts are regenerated.
 *
 * Keep this file free of imports so the functions bundle can include it.
 */
export const SERVER_OVERLAY_STYLE_VERSION = 'overdive-overlay-v17';
