import { describe, expect, it } from 'vitest';

import {
	DISCIPLINE_DEFAULT_SPEED_MS,
	defaultSpeedMs
} from './disciplineSpeeds';

describe('disciplineSpeeds', () => {
	it.each([
		['DYN', 1.1],
		['DYNB', 1.0],
		['DNF', 0.8]
	] as const)('%s default speed = %s m/s', (discipline, expected) => {
		expect(defaultSpeedMs(discipline)).toBe(expected);
		expect(DISCIPLINE_DEFAULT_SPEED_MS[discipline]).toBe(expected);
	});

	it('table is frozen so values cannot be mutated at runtime', () => {
		expect(Object.isFrozen(DISCIPLINE_DEFAULT_SPEED_MS)).toBe(true);
	});
});
