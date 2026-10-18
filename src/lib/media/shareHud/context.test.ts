import { describe, expect, it } from 'vitest';
import { shareHudContextForVideo } from './context';

describe('shareHudContextForVideo', () => {
	it('uses the stored share context and edits', () => {
		const context = shareHudContextForVideo({
			poolLength: 50,
			discipline: 'DNF',
			shareContext: { pbBeforeM: 150, athleteName: 'Pat', dateLabel: '17 Oct 2026' },
			shareEdit: { firstLengthDirection: 'rtl' }
		});
		expect(context).toMatchObject({ poolLengthM: 50, discipline: 'DNF', pbBeforeM: 150, athleteName: 'Pat', dateLabel: '17 Oct 2026', firstLengthDirection: 'rtl' });
	});

	it('falls back for older videos', () => {
		const context = shareHudContextForVideo({ recordedAt: { toDate: () => new Date('2026-06-30T23:30:00Z') } });
		expect(context).toMatchObject({ poolLengthM: 25, discipline: 'DYN', pbBeforeM: null, athleteName: null, dateLabel: '30 Jun 2026', firstLengthDirection: 'ltr' });
	});
});
