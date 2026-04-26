import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	parseBiometricCsv,
	parseTimestamp,
	validateBiometricCsv
} from './biometricCsvParser';

const fixture = (name: string) =>
	readFileSync(resolve(process.cwd(), 'data', name), 'utf-8');

describe('parseTimestamp', () => {
	it('parses 24h zero-padded format', () => {
		const d = parseTimestamp('23/03/2025 12:27:14');
		expect(d.getFullYear()).toBe(2025);
		expect(d.getMonth()).toBe(2); // March
		expect(d.getDate()).toBe(23);
		expect(d.getHours()).toBe(12);
		expect(d.getMinutes()).toBe(27);
	});

	it('parses 24h non-padded format', () => {
		const d = parseTimestamp('18/08/2025 18:29:56');
		expect(d.getHours()).toBe(18);
		expect(d.getDate()).toBe(18);
	});

	it('treats 12:00:00 AM as midnight', () => {
		const d = parseTimestamp('26/4/2026 12:00:00 AM');
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(3); // April
		expect(d.getDate()).toBe(26);
		expect(d.getHours()).toBe(0);
		expect(d.getMinutes()).toBe(0);
	});

	it('treats 12:30 PM as noon-half', () => {
		const d = parseTimestamp('1/1/2026 12:30:00 PM');
		expect(d.getHours()).toBe(12);
		expect(d.getMinutes()).toBe(30);
	});

	it('adds 12h to PM hours 1-11', () => {
		const d = parseTimestamp('1/1/2026 1:05:09 PM');
		expect(d.getHours()).toBe(13);
		expect(d.getMinutes()).toBe(5);
		expect(d.getSeconds()).toBe(9);
	});

	it('keeps AM hours 1-11 unchanged', () => {
		const d = parseTimestamp('1/1/2026 7:00:00 AM');
		expect(d.getHours()).toBe(7);
	});

	it('returns invalid date for unrecognised input', () => {
		const d = parseTimestamp('not a date');
		expect(Number.isNaN(d.getTime())).toBe(true);
	});
});

describe('parseBiometricCsv — Format A (single round, no Number column)', () => {
	const csv = fixture('Sunday, March 23, 2025.csv');

	it('validates', () => {
		expect(validateBiometricCsv(csv)).toBeNull();
	});

	it('extracts the single round', () => {
		const session = parseBiometricCsv(csv);
		expect(session.rounds).toHaveLength(1);
		expect(session.rounds[0]).toEqual({
			roundNumber: 1,
			recoveryTime: 270, // 04:30
			apneaTime: 466 // 07:46
		});
		expect(session.totalRounds).toBe(1);
		expect(session.totalApneaTime).toBe(466);
		expect(session.totalRecoveryTime).toBe(270);
	});

	it('parses the timestamp', () => {
		const session = parseBiometricCsv(csv);
		expect(session.timestamp.getFullYear()).toBe(2025);
		expect(session.timestamp.getMonth()).toBe(2);
		expect(session.timestamp.getDate()).toBe(23);
	});

	it('parses biometric readings', () => {
		const session = parseBiometricCsv(csv);
		expect(session.readings.length).toBeGreaterThan(0);
		for (const r of session.readings) {
			expect(['apnea', 'recovery']).toContain(r.intervalType);
		}
	});
});

describe('parseBiometricCsv — Format B (ROUND N rows)', () => {
	const csv = fixture('Monday, August 18, 2026.csv');

	it('validates', () => {
		expect(validateBiometricCsv(csv)).toBeNull();
	});

	it('extracts 11 rounds and the cooldown is excluded', () => {
		const session = parseBiometricCsv(csv);
		expect(session.rounds).toHaveLength(11);
		expect(session.rounds[0]).toEqual({
			roundNumber: 1,
			recoveryTime: 120, // 02:00
			apneaTime: 101 // 01:41
		});
		expect(session.rounds[10]).toEqual({
			roundNumber: 11,
			recoveryTime: 180, // 03:00
			apneaTime: 211 // 03:31
		});
	});

	it('parses the timestamp', () => {
		const session = parseBiometricCsv(csv);
		expect(session.timestamp.getFullYear()).toBe(2025);
		expect(session.timestamp.getMonth()).toBe(7); // August
		expect(session.timestamp.getDate()).toBe(18);
		expect(session.timestamp.getHours()).toBe(18);
	});
});

describe('parseBiometricCsv — Format C (per-round blocks, AM/PM)', () => {
	const csv = fixture('stamina-exercise-2026-04-26-00-00.csv');

	it('validates', () => {
		expect(validateBiometricCsv(csv)).toBeNull();
	});

	it('extracts 9 apnea rounds (cooldown-only round 10 excluded)', () => {
		const session = parseBiometricCsv(csv);
		expect(session.rounds).toHaveLength(9);
		expect(session.rounds[0]).toEqual({
			roundNumber: 1,
			recoveryTime: 120, // Interval 1 Rest 02:00
			apneaTime: 131 // Interval 2 Apnea 02:11
		});
		expect(session.rounds[1]).toEqual({
			roundNumber: 2,
			recoveryTime: 210, // 03:30
			apneaTime: 169 // 02:49
		});
		expect(session.rounds[8]).toEqual({
			roundNumber: 9,
			recoveryTime: 300, // 05:00
			apneaTime: 451 // 07:31
		});
	});

	it('parses the AM timestamp as midnight', () => {
		const session = parseBiometricCsv(csv);
		expect(session.timestamp.getFullYear()).toBe(2026);
		expect(session.timestamp.getMonth()).toBe(3); // April
		expect(session.timestamp.getDate()).toBe(26);
		expect(session.timestamp.getHours()).toBe(0);
		expect(session.timestamp.getMinutes()).toBe(0);
	});

	it('parses biometric readings including cooldown rows', () => {
		const session = parseBiometricCsv(csv);
		expect(session.readings.length).toBeGreaterThan(0);
		// Format C readings include Cooldown which we map to 'recovery'
		for (const r of session.readings) {
			expect(['apnea', 'recovery']).toContain(r.intervalType);
		}
	});
});
