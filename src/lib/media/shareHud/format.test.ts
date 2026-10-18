import { describe, expect, it } from 'vitest';
import {
	disciplineLabel,
	formatFinalDistance,
	formatHudTime,
	formatLiveDistance,
	formatSignedDelta,
	formatSplit
} from './format';

describe('formatHudTime', () => {
	it('drops minutes under a minute', () => {
		expect(formatHudTime(45_390)).toBe('45.3');
		expect(formatHudTime(0)).toBe('0.0');
	});

	it('pads seconds past a minute and truncates tenths', () => {
		expect(formatHudTime(105_099)).toBe('1:45.0');
		expect(formatHudTime(165_000)).toBe('2:45.0');
	});

	it('clamps negative values', () => {
		expect(formatHudTime(-500)).toBe('0.0');
	});
});

describe('distances', () => {
	it('floors the live distance', () => {
		expect(formatLiveDistance(123.8)).toBe('123');
		expect(formatLiveDistance(49.9999999)).toBe('50');
	});

	it('shows a fraction on the final distance only when there is one', () => {
		expect(formatFinalDistance(190)).toBe('190');
		expect(formatFinalDistance(187.46)).toBe('187.5');
	});
});

describe('formatSignedDelta', () => {
	it('uses a true minus sign and = for zero', () => {
		expect(formatSignedDelta(-0.021, 2)).toBe('\u22120.02');
		expect(formatSignedDelta(0.6, 1)).toBe('+0.6');
		expect(formatSignedDelta(0.004, 2)).toBe('=');
	});
});

describe('formatSplit', () => {
	it('formats seconds and minutes', () => {
		expect(formatSplit(43_049)).toBe('43.0 s');
		expect(formatSplit(62_300)).toBe('1:02.3');
	});
});

it('labels disciplines', () => {
	expect(disciplineLabel('DNF')).toBe('Dynamic no fins');
});
