/**
 * Video document → `ShareHudContext`. Shared by the overlay worker and the
 * in-app player so both draw the same HUD for a video.
 */

import type { HudDiscipline } from './format';
import type { ShareHudContext } from './model';
import type { GraphDirection } from './speedGraph';

/** The dive video fields the HUD reads (structural, so both the app and the worker types fit). */
export interface ShareHudVideoFields {
	readonly poolLength?: number;
	readonly discipline?: HudDiscipline;
	readonly recordedAt?: { toDate?: () => Date } | null;
	readonly shareContext?: {
		readonly pbBeforeM?: number | null;
		readonly athleteName?: string | null;
		readonly dateLabel?: string | null;
	} | null;
	readonly shareEdit?: { readonly firstLengthDirection?: GraphDirection } | null;
}

export function shareHudContextForVideo(video: ShareHudVideoFields): ShareHudContext {
	const recordedAt = video.recordedAt?.toDate?.();
	return {
		poolLengthM: video.poolLength ?? 25,
		discipline: video.discipline ?? 'DYN',
		pbBeforeM: video.shareContext?.pbBeforeM ?? null,
		athleteName: video.shareContext?.athleteName ?? null,
		// Videos created before the share context snapshot existed: date in UTC, so server and app agree.
		dateLabel:
			video.shareContext?.dateLabel ??
			(recordedAt
				? recordedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
				: null),
		branding: 'subtle',
		firstLengthDirection: video.shareEdit?.firstLengthDirection ?? 'ltr'
	};
}
