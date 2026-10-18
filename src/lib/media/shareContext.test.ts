import { describe, expect, it } from 'vitest';
import type { PersonalBestRecord, PersonalBestRecords } from '$lib/types';
import { pbBeforeFromRecords, shareDateLabel } from './shareContext';

function record(partial: Partial<PersonalBestRecord>): PersonalBestRecord {
	return {
		key: partial.key ?? 'k',
		discipline: 'DYN',
		categoryKind: 'standard',
		categoryLabel: 'Standard',
		metric: 'distance',
		value: 100,
		routineLogId: 'log-a',
		date: {} as PersonalBestRecord['date'],
		isStandard: true,
		...partial
	} as PersonalBestRecord;
}

describe('pbBeforeFromRecords', () => {
	const records: PersonalBestRecords = {
		a: record({ key: 'a', value: 175, routineLogId: 'log-a' }),
		b: record({ key: 'b', value: 150, routineLogId: 'log-b' }),
		c: record({ key: 'c', value: 200, isStandard: false }),
		d: record({ key: 'd', value: 120, discipline: 'DNF' as PersonalBestRecord['discipline'] })
	};

	it('uses the best standard distance record for the discipline', () => {
		expect(pbBeforeFromRecords({ records, legacy: undefined, discipline: 'DYN' })).toEqual({ pbBeforeM: 175, pbSource: 'record' });
	});

	it('skips a record set by this dive', () => {
		expect(pbBeforeFromRecords({ records, legacy: undefined, discipline: 'DYN', routineLogId: 'log-a' })).toEqual({
			pbBeforeM: 150,
			pbSource: 'record'
		});
	});

	it('falls back to the legacy PB, then to none', () => {
		expect(pbBeforeFromRecords({ records: undefined, legacy: { DYNB: 90 }, discipline: 'DYNB' })).toEqual({ pbBeforeM: 90, pbSource: 'legacy' });
		expect(pbBeforeFromRecords({ records: undefined, legacy: { DYNB: 90 }, discipline: 'DYNB', routineLogId: 'x' }).pbSource).toBe('none');
		expect(pbBeforeFromRecords({ records: undefined, legacy: undefined, discipline: 'DYN' })).toEqual({ pbBeforeM: null, pbSource: 'none' });
	});
});

it('formats the date label', () => {
	expect(shareDateLabel(new Date(2026, 9, 17, 12))).toBe('17 Oct 2026');
});
