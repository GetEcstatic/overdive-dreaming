/**
 * Overdive Dreaming — Cloud Functions entrypoint.
 *
 * Functions:
 *   - onDiveVideoCreated: retention reaper (keeps 20 newest non-pinned per owner).
 *
 * Deploy: `npm run deploy` from this directory (after `firebase login`).
 *
 * See docs/Dynamic video feature.md §7 (retention) and T12.
 */

import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onDiveVideoCreated } from './retentionReaper.js';
export {
	abortDiveVideoMultipartUpload,
	completeDiveVideoMultipartUpload,
	createDiveVideoMultipartUpload,
	createMediaUpload,
	deleteMediaObject,
	getMediaReadUrl,
	signDiveVideoPart
} from './mediaSigning.js';
export { acceptDiveGift } from './acceptDiveGift.js';
