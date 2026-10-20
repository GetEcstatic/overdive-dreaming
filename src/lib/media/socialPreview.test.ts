import { describe, expect, it } from 'vitest';
import { socialCutEditList } from './shareHud/socialCut';
import { editStrip, previewSync } from './socialPreview';

const edl = socialCutEditList({
	diveStartMs: 10_000,
	diveEndMs: 175_000,
	wallsMs: [50_000, 95_000, 140_000],
	pbCrossedAtMs: null,
	recordingDurationMs: 200_000,
	timelineProtocolEndMs: 185_000
});

describe('previewSync', () => {
	it('plays 1× pieces at normal rate and only seeks on real drift', () => {
		expect(previewSync(edl, 1_000, 9_050, 'rate')).toEqual({ targetSourceMs: 9_000, playbackRate: 1, seek: false, inCard: false });
		expect(previewSync(edl, 1_000, 9_600, 'rate').seek).toBe(true);
	});

	it('plays fast-forward at its speed in rate mode', () => {
		const sync = previewSync(edl, 6_000, 25_000, 'rate');
		expect(sync).toMatchObject({ targetSourceMs: 25_000, playbackRate: 12, seek: false });
	});

	it('pauses and steps through fast-forward in step mode', () => {
		expect(previewSync(edl, 6_000, 25_000, 'step')).toMatchObject({ playbackRate: 0, seek: false });
		expect(previewSync(edl, 6_000, 23_000, 'step')).toMatchObject({ playbackRate: 0, seek: true });
	});

	it('seeks across a cut between segments', () => {
		const firstTurn = edl.segments.find((s) => s.kind === 'turn')!;
		expect(previewSync(edl, firstTurn.outFromMs + 10, 20_000, 'rate').seek).toBe(true);
	});

	it('holds the protocol end frame during the card', () => {
		expect(previewSync(edl, edl.clipDurationMs + 1_000, 185_000, 'rate')).toEqual({
			targetSourceMs: 185_000,
			playbackRate: 0,
			seek: false,
			inCard: true
		});
	});
});

describe('editStrip', () => {
	it('lays the cut and the unused tail across the recording', () => {
		const strip = editStrip(edl, { diveEndMs: 175_000, recordingEndMs: 200_000, wallsMs: [50_000, 95_000, 140_000] });
		const total = strip.blocks.reduce((sum, b) => sum + b.width, 0);
		expect(total).toBeCloseTo(100, 6);
		expect(strip.blocks[0]).toMatchObject({ left: 0, kind: 'normal' });
		expect(strip.blocks.at(-1)).toMatchObject({ kind: 'unused' });
		expect(strip.handleLeft).toBeCloseTo(((175_000 - 8_000) / 192_000) * 100, 6);
		expect(strip.handleLeft + strip.handleWidth).toBeCloseTo(100, 6);
		expect(strip.walls).toHaveLength(3);
	});
});
