/**
 * Suggested caption for a shared social cut (spec share-hud-redesign.md §6.4),
 * copied to the clipboard when the owner shares. Plain text, no handle.
 */

import { formatFinalDistance, formatHudTime, type HudDiscipline } from './shareHud/format';

const HASHTAGS: Readonly<Record<HudDiscipline, string>> = {
	DYN: '#freediving #apnea #dynamicapnea',
	DNF: '#freediving #apnea #dynamicnofins',
	DYNB: '#freediving #apnea #bifins'
};

export interface SocialCaptionInput {
	readonly discipline: HudDiscipline;
	readonly finalM: number;
	readonly totalMs: number;
	/** Only when the owner shows the PB on the cut. */
	readonly pb: { readonly kind: 'new' | 'short'; readonly deltaM: number } | null;
}

export function socialCaption(input: SocialCaptionInput): string {
	const parts = [`${formatFinalDistance(input.finalM)} m ${input.discipline}`, formatHudTime(input.totalMs)];
	if (input.pb?.kind === 'new') parts.push(`new PB (+${formatFinalDistance(input.pb.deltaM)} m)`);
	return `${parts.join(' · ')}\nTracked with overdive.app\n${HASHTAGS[input.discipline] ?? HASHTAGS.DYN}`;
}
