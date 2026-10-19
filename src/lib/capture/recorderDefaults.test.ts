import { describe, expect, it } from 'vitest';
import { recorderDefaultsFor, withRecorderDefaults } from './recorderDefaults';

describe('recorderDefaultsFor', () => {
  it('uses discipline-specific values over legacy global defaults', () => {
    expect(recorderDefaultsFor({
      defaultPoolLength: 25,
      defaultWaypointsPerLap: 2,
      recorder: {
        defaultsByDiscipline: {
          DYN: { poolLength: 50, waypointsPerLap: 4, announcedPerformanceMeters: 100 }
        }
      }
    }, 'DYN')).toEqual({
      poolLength: 50,
      waypointsPerLap: 4,
      announcedPerformanceMeters: 100,
      announcedPerformanceSeconds: undefined
    });
  });

  it('falls back to legacy global pool defaults', () => {
    expect(recorderDefaultsFor({ defaultPoolLength: 25, defaultWaypointsPerLap: 2 }, 'DNF')).toEqual({
      poolLength: 25,
      waypointsPerLap: 2,
      announcedPerformanceSeconds: undefined,
      announcedPerformanceMeters: undefined
    });
  });
});

describe('withRecorderDefaults', () => {
  it('preserves framing guide and other disciplines while updating one discipline', () => {
    expect(withRecorderDefaults({
      recorder: {
        framingGuide: false,
        defaultsByDiscipline: { DYN: { poolLength: 25 } }
      }
    }, 'DNF', { poolLength: 50, waypointsPerLap: 4 })).toEqual({
      framingGuide: false,
      defaultsByDiscipline: {
        DYN: { poolLength: 25 },
        DNF: { poolLength: 50, waypointsPerLap: 4 }
      }
    });
  });
});
