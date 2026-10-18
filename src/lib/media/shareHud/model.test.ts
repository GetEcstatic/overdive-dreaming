import { describe, expect, it } from 'vitest';
import { fixtureTimeline, FIXTURE_PB_M, FIXTURE_POOL_M } from './fixtures';
import { prepareDive, resultCard, shareHudFrame, SPLIT_TOAST_HOLD_MS, type ShareHudContext } from './model';

const context: ShareHudContext = {
	poolLengthM: FIXTURE_POOL_M,
	discipline: 'DYN',
	pbBeforeM: FIXTURE_PB_M,
	athleteName: 'Test Diver',
	dateLabel: '17 Oct 2026',
	branding: 'subtle',
	firstLengthDirection: 'ltr'
};
const dive = prepareDive(fixtureTimeline(), context);
const noCard = { cardAtMs: null };

describe('prepareDive', () => {
	it('derives walls, splits and deltas', () => {
		expect(dive.walls.map((w) => w.length)).toEqual([1, 2, 3]);
		expect(dive.walls[0]).toMatchObject({ atMs: 57_000, splitMs: 42_000, deltaMs: null });
		expect(dive.walls[1].deltaMs).toBe(1_000); // 43.0 vs 42.0
		expect(dive.finalM).toBeCloseTo(190, 6);
		expect(dive.lengths).toBe(4);
	});

	it('finds when the PB was passed', () => {
		expect(dive.pbCrossedAtMs).toBe(164_600);
	});

	it('has no PB crossing without a PB or when it was not reached', () => {
		expect(prepareDive(fixtureTimeline(), { ...context, pbBeforeM: null }).pbCrossedAtMs).toBeNull();
		expect(prepareDive(fixtureTimeline(), { ...context, pbBeforeM: 200 }).pbCrossedAtMs).toBeNull();
	});
});

describe('shareHudFrame', () => {
	it('is idle before the dive', () => {
		const f = shareHudFrame(dive, 5_000, noCard);
		expect(f).toMatchObject({ phase: 'pre', elapsedMs: 0, distanceM: 0, speedMs: 0, length: 1, toast: null });
	});

	it('reports live values', () => {
		const f = shareHudFrame(dive, 120_000, noCard);
		expect(f.phase).toBe('live');
		expect(f.elapsedMs).toBe(105_000);
		expect(f.distanceM).toBeGreaterThan(124);
		expect(f.length).toBe(3);
		expect(f.speedMs).toBeGreaterThan(1);
	});

	it('shows a split toast after each wall, then hides it', () => {
		const f = shareHudFrame(dive, 101_000, noCard);
		expect(f.toast).toMatchObject({ kind: 'split', length: 2, splitMs: 43_000, deltaMs: 1_000 });
		expect(shareHudFrame(dive, 57_000 + SPLIT_TOAST_HOLD_MS + 1, noCard).toast).toBeNull();
	});

	it('the PB toast wins over a split toast and the PB state flips at the crossing', () => {
		const before = shareHudFrame(dive, 164_000, noCard);
		expect(before.pb?.passed).toBe(false);
		const after = shareHudFrame(dive, 165_000, noCard);
		expect(after.toast?.kind).toBe('pb');
		expect(after.pb?.passed).toBe(true);
		expect(after.pb?.beyondM).toBeGreaterThan(0);
	});

	it('freezes the final values after the finish and shows the average speed', () => {
		const f = shareHudFrame(dive, 185_000, noCard);
		expect(f.phase).toBe('finish');
		expect(f.elapsedMs).toBe(165_000);
		expect(f.distanceM).toBeCloseTo(190, 6);
		expect(f.speedMs).toBeCloseTo(190 / 165, 6);
		expect(f.toast).toBeNull();
	});

	it('fades the card in from cardAtMs', () => {
		expect(shareHudFrame(dive, 190_000, { cardAtMs: 190_000 })).toMatchObject({ phase: 'card', cardOpacity: 0 });
		expect(shareHudFrame(dive, 190_200, { cardAtMs: 190_000 }).cardOpacity).toBeCloseTo(0.5, 6);
		expect(shareHudFrame(dive, 191_000, { cardAtMs: 190_000 }).cardOpacity).toBe(1);
	});
});

describe('resultCard', () => {
	it('summarises the dive with a new PB', () => {
		const card = resultCard(dive);
		expect(card.finalM).toBeCloseTo(190, 6);
		expect(card.totalMs).toBe(165_000);
		expect(card.pb).toMatchObject({ kind: 'new', targetM: 175 });
		expect(card.pb?.deltaM).toBeCloseTo(15, 6);
		expect(card.lengths).toHaveLength(4);
		expect(card.footer).toBe('Test Diver · 17 Oct 2026 · overdive.app');
	});

	it('reports a shortfall, or nothing without a PB', () => {
		expect(resultCard(prepareDive(fixtureTimeline(), { ...context, pbBeforeM: 200 })).pb).toMatchObject({ kind: 'short' });
		const none = resultCard(prepareDive(fixtureTimeline(), { ...context, pbBeforeM: null, athleteName: null, branding: 'off' }));
		expect(none.pb).toBeNull();
		expect(none.footer).toBe('17 Oct 2026');
	});
});
