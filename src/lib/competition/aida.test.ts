import { describe, expect, it } from 'vitest';
import {
	buildAidaAttempt,
	competitionCompatibilityFields,
	deriveAidaStartPenalty,
	deriveUnderApPenalty,
	dqOtherReferenceItems,
	scoreAidaPerformance
} from './aida';

describe('AIDA competition helpers', () => {
	it('scores STA attempts at 0.2 points per second', () => {
		const scored = scoreAidaPerformance({
			mode: 'official-competition',
			discipline: 'STA',
			realizedPerformanceSeconds: 210,
			card: 'white'
		});

		expect(scored.rawPoints).toBe(42);
		expect(scored.penaltyPoints).toBe(0);
		expect(scored.finalPoints).toBe(42);
	});

	it('scores dynamic attempts at 0.5 points per meter', () => {
		const scored = scoreAidaPerformance({
			mode: 'official-competition',
			discipline: 'DYN',
			realizedPerformanceMeters: 123.9,
			card: 'white'
		});

		expect(scored.rawPoints).toBe(61.5);
		expect(scored.finalPoints).toBe(61.5);
	});

	it('derives early and late start penalties from OT-relative offsets', () => {
		expect(deriveAidaStartPenalty(-3)).toMatchObject({ code: 'EARLY_START', seconds: 3, points: 1 });
		expect(deriveAidaStartPenalty(14)).toMatchObject({ code: 'LATE_START', seconds: 4, points: 1 });
		expect(deriveAidaStartPenalty(31)).toMatchObject({ code: 'DQ_LATE_START' });
	});

	it('derives UNDER_AP penalties by discipline', () => {
		expect(deriveUnderApPenalty('STA', 200, 190)).toMatchObject({ code: 'UNDER_AP', seconds: 10, points: 2 });
		expect(deriveUnderApPenalty('DYN', undefined, undefined, 100, 96.4)).toMatchObject({ code: 'UNDER_AP', meters: 3, points: 1.5 });
	});

	it('sets red-card final points to zero', () => {
		const scored = scoreAidaPerformance({
			mode: 'official-competition',
			discipline: 'DYNB',
			realizedPerformanceMeters: 100,
			card: 'red',
			disqualificationReasons: [{ code: 'DQSP', details: ['SP completed after 15.0 seconds'] }]
		});

		expect(scored.rawPoints).toBe(50);
		expect(scored.finalPoints).toBe(0);
	});

	it('builds a scored attempt with derived start and AP penalties', () => {
		const attempt = buildAidaAttempt({
			mode: 'official-competition',
			discipline: 'STA',
			startOffsetSeconds: 13,
			announcedPerformanceSeconds: 200,
			realizedPerformanceSeconds: 190,
			card: 'yellow'
		});

		expect(attempt.penalties?.map((penalty) => penalty.code)).toEqual(['LATE_START', 'UNDER_AP']);
		expect(attempt.penaltyPoints).toBe(3);
		expect(attempt.finalPoints).toBe(35);
	});

	it('marks only official competition attempts as legacy competition', () => {
		expect(competitionCompatibilityFields({ mode: 'official-competition', discipline: 'DYN', card: 'white' })).toEqual({
			isCompetition: true,
			compeitionOrg: 'AIDA',
			cardTag: 'white',
			recordTag: undefined
		});
		expect(competitionCompatibilityFields({ mode: 'protocol-practice', discipline: 'DYN', card: 'white' })).toEqual({
			isCompetition: false,
			compeitionOrg: null,
			cardTag: 'white',
			recordTag: undefined
		});
	});

	it('keeps DQOTHER reference items as discipline-aware help text', () => {
		expect(dqOtherReferenceItems('STA')).toContain('Coach fully immersed during performance');
		expect(dqOtherReferenceItems('DYN')).toContain('Airway not submerged within 1.5 m of the wall');
		expect(dqOtherReferenceItems('DYNB')).toContain('Dolphin kick while wearing bifins, except one allowed at the turn');
	});
});
