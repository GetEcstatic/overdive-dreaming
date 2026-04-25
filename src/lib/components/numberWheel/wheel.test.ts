import { describe, expect, it } from 'vitest';
import {
	format,
	indexFromOffset,
	indexOf,
	initialState,
	neighbourIndices,
	precisionOf,
	reduce,
	snap,
	valueAt,
	valueCount,
	values
} from './wheel';
import type { WheelSpec, WheelState } from './types';

const intSpec: WheelSpec = { min: 0, max: 100, step: 5 };
const decimalSpec: WheelSpec = { min: 0, max: 5, step: 0.5 };
const negSpec: WheelSpec = { min: -10, max: 10, step: 1 };

describe('precisionOf', () => {
	it('uses 0 dp for integer steps', () => {
		expect(precisionOf(intSpec)).toBe(0);
	});
	it('uses 2 dp for decimal steps when not specified', () => {
		expect(precisionOf(decimalSpec)).toBe(2);
	});
	it('honours explicit precision', () => {
		expect(precisionOf({ ...decimalSpec, precision: 1 })).toBe(1);
	});
});

describe('values / valueCount', () => {
	it('enumerates inclusive integer range', () => {
		expect(values(intSpec)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
	});
	it('enumerates decimal range without floating point drift', () => {
		expect(values({ ...decimalSpec, precision: 1 })).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
	});
	it('enumerates negative range', () => {
		expect(values(negSpec)).toEqual([
			-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
		]);
	});
	it('valueCount matches values().length', () => {
		expect(valueCount(intSpec)).toBe(values(intSpec).length);
		expect(valueCount(decimalSpec)).toBe(values(decimalSpec).length);
	});
});

describe('indexOf / valueAt', () => {
	it('round-trips for valid values', () => {
		expect(valueAt(intSpec, indexOf(intSpec, 50))).toBe(50);
		expect(valueAt(negSpec, indexOf(negSpec, -3))).toBe(-3);
	});
	it('centres when value undefined', () => {
		expect(indexOf(intSpec, undefined)).toBe(Math.floor(values(intSpec).length / 2));
	});
	it('clamps to range', () => {
		expect(valueAt(intSpec, -10)).toBe(0);
		expect(valueAt(intSpec, 999)).toBe(100);
	});
});

describe('snap', () => {
	it('rounds to nearest step and clamps', () => {
		expect(snap(intSpec, 7)).toBe(5);
		expect(snap(intSpec, 8)).toBe(10);
		expect(snap(intSpec, -3)).toBe(0);
		expect(snap(intSpec, 999)).toBe(100);
	});
	it('handles decimal steps', () => {
		expect(snap(decimalSpec, 1.2)).toBe(1);
		expect(snap(decimalSpec, 1.3)).toBe(1.5);
	});
});

describe('format', () => {
	it('formats integers without decimals', () => {
		expect(format(intSpec, 50)).toBe('50');
	});
	it('formats decimals at precision', () => {
		expect(format({ ...decimalSpec, precision: 1 }, 1.5)).toBe('1.5');
	});
});

describe('initialState', () => {
	it('starts closed, no drag, no pending', () => {
		expect(initialState(50)).toEqual({
			value: 50,
			dragIndex: null,
			open: false,
			pending: undefined
		});
	});
});

describe('reduce', () => {
	const base: WheelState = { value: 50, dragIndex: null, open: false, pending: undefined };

	it('open primes pending and dragIndex from current value', () => {
		const s = reduce(base, { kind: 'open' }, intSpec);
		expect(s.open).toBe(true);
		expect(s.pending).toBe(50);
		expect(s.dragIndex).toBe(indexOf(intSpec, 50));
	});

	it('open with undefined value centres on middle index', () => {
		const s = reduce({ ...base, value: undefined }, { kind: 'open' }, intSpec);
		expect(s.dragIndex).toBe(Math.floor(valueCount(intSpec) / 2));
		expect(s.pending).toBe(valueAt(intSpec, s.dragIndex!));
	});

	it('drag updates pending without committing value', () => {
		const opened = reduce(base, { kind: 'open' }, intSpec);
		const dragged = reduce(opened, { kind: 'drag', index: 0 }, intSpec);
		expect(dragged.pending).toBe(0);
		expect(dragged.dragIndex).toBe(0);
		expect(dragged.value).toBe(50); // unchanged
	});

	it('drag clamps out-of-range indices', () => {
		const s = reduce(base, { kind: 'drag', index: 9999 }, intSpec);
		expect(s.dragIndex).toBe(valueCount(intSpec) - 1);
	});

	it('confirm commits pending and closes', () => {
		const opened = reduce(base, { kind: 'open' }, intSpec);
		const dragged = reduce(opened, { kind: 'drag', index: 0 }, intSpec);
		const confirmed = reduce(dragged, { kind: 'confirm' }, intSpec);
		expect(confirmed).toEqual({ value: 0, open: false, dragIndex: null, pending: undefined });
	});

	it('confirm with explicit value snaps and commits', () => {
		const s = reduce(base, { kind: 'confirm', value: 53 }, intSpec);
		expect(s.value).toBe(55);
		expect(s.open).toBe(false);
	});

	it('cancel drops pending and keeps value', () => {
		const opened = reduce(base, { kind: 'open' }, intSpec);
		const dragged = reduce(opened, { kind: 'drag', index: 0 }, intSpec);
		const cancelled = reduce(dragged, { kind: 'cancel' }, intSpec);
		expect(cancelled).toEqual({ value: 50, open: false, dragIndex: null, pending: undefined });
	});

	it('nudge walks the array and commits immediately', () => {
		expect(reduce(base, { kind: 'nudge', delta: 1 }, intSpec).value).toBe(55);
		expect(reduce(base, { kind: 'nudge', delta: -1 }, intSpec).value).toBe(45);
		expect(reduce({ ...base, value: 100 }, { kind: 'nudge', delta: 5 }, intSpec).value).toBe(100);
		expect(reduce({ ...base, value: 0 }, { kind: 'nudge', delta: -5 }, intSpec).value).toBe(0);
	});

	it('nudge from undefined snaps to a valid value', () => {
		const s = reduce({ ...base, value: undefined }, { kind: 'nudge', delta: 1 }, intSpec);
		expect(s.value).toBeDefined();
		expect(values(intSpec)).toContain(s.value!);
	});

	it('type updates pending only', () => {
		const opened = reduce(base, { kind: 'open' }, intSpec);
		const typed = reduce(opened, { kind: 'type', raw: '37' }, intSpec);
		expect(typed.pending).toBe(35); // snapped
		expect(typed.value).toBe(50); // unchanged until confirm
	});

	it('type with empty string clears pending', () => {
		const s = reduce({ ...base, pending: 50 }, { kind: 'type', raw: '   ' }, intSpec);
		expect(s.pending).toBeUndefined();
	});

	it('type with non-numeric input is a no-op', () => {
		const s1 = { ...base, pending: 50 };
		const s2 = reduce(s1, { kind: 'type', raw: 'abc' }, intSpec);
		expect(s2).toBe(s1);
	});

	it('set updates value (snapped)', () => {
		const s = reduce(base, { kind: 'set', value: 33 }, intSpec);
		expect(s.value).toBe(35);
	});

	it('set undefined clears value', () => {
		const s = reduce(base, { kind: 'set', value: undefined }, intSpec);
		expect(s.value).toBeUndefined();
	});
});

describe('indexFromOffset', () => {
	it('positive deltaY moves up the list (lower index)', () => {
		expect(
			indexFromOffset({ startIndex: 10, deltaY: 64, rowHeight: 64, count: 21 })
		).toBe(9);
	});
	it('negative deltaY moves down the list', () => {
		expect(
			indexFromOffset({ startIndex: 10, deltaY: -128, rowHeight: 64, count: 21 })
		).toBe(12);
	});
	it('clamps at boundaries', () => {
		expect(indexFromOffset({ startIndex: 0, deltaY: 9999, rowHeight: 64, count: 21 })).toBe(0);
		expect(indexFromOffset({ startIndex: 20, deltaY: -9999, rowHeight: 64, count: 21 })).toBe(20);
	});
});

describe('neighbourIndices', () => {
	it('returns symmetric range when not at edge', () => {
		expect(neighbourIndices({ centre: 5, radius: 2, count: 11 })).toEqual([3, 4, 5, 6, 7]);
	});
	it('clips at low edge', () => {
		expect(neighbourIndices({ centre: 1, radius: 3, count: 11 })).toEqual([0, 1, 2, 3, 4]);
	});
	it('clips at high edge', () => {
		expect(neighbourIndices({ centre: 9, radius: 3, count: 11 })).toEqual([6, 7, 8, 9, 10]);
	});
});
