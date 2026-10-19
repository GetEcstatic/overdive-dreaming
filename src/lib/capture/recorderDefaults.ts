import type { RecorderDefaults, RecorderDiscipline, UserSettings } from '$lib/types';

/** Return the discipline-specific defaults, falling back to legacy global values. */
export function recorderDefaultsFor(
  settings: Pick<UserSettings, 'defaultPoolLength' | 'defaultWaypointsPerLap' | 'recorder'> | undefined,
  discipline: RecorderDiscipline
): RecorderDefaults {
  const specific = settings?.recorder?.defaultsByDiscipline?.[discipline];
  return {
    poolLength: specific?.poolLength ?? settings?.defaultPoolLength,
    waypointsPerLap: specific?.waypointsPerLap ?? settings?.defaultWaypointsPerLap,
    announcedPerformanceSeconds: specific?.announcedPerformanceSeconds,
    announcedPerformanceMeters: specific?.announcedPerformanceMeters
  };
}

/** Merge one discipline's defaults without losing framingGuide or other recorder settings. */
export function withRecorderDefaults(
  settings: Pick<UserSettings, 'recorder'> | undefined,
  discipline: RecorderDiscipline,
  defaults: RecorderDefaults
): NonNullable<UserSettings['recorder']> {
  return {
    ...(settings?.recorder ?? {}),
    defaultsByDiscipline: {
      ...(settings?.recorder?.defaultsByDiscipline ?? {}),
      [discipline]: { ...defaults }
    }
  };
}
