import { describe, expect, it } from 'vitest';
import {
  reviewPrimaryActionLabel,
  reviewSaveStatus,
  reviewSections,
  validateReviewMetrics
} from './reviewModel';

describe('reviewSections', () => {
  it('keeps the public video review focused', () => {
    expect(reviewSections({ source: 'video', access: 'public', hasAidaContext: false })).toEqual({
      correctResult: true,
      importedMarkers: false,
      aidaProtocol: false,
      diagnostics: false,
      advancedActions: false,
      videoPreview: true
    });
  });

  it('shows imported marker editing only for imported captures', () => {
    expect(reviewSections({ source: 'import', access: 'public', hasAidaContext: false }).importedMarkers).toBe(true);
    expect(reviewSections({ source: 'video', access: 'public', hasAidaContext: false }).importedMarkers).toBe(false);
  });

  it('gates diagnostics and advanced actions by capability', () => {
    for (const access of ['advanced', 'admin'] as const) {
      const sections = reviewSections({ source: 'video', access, hasAidaContext: false });
      expect(sections.diagnostics).toBe(true);
      expect(sections.advancedActions).toBe(true);
    }
    expect(reviewSections({ source: 'metrics-only', access: 'admin', hasAidaContext: false })).toMatchObject({
      diagnostics: false,
      advancedActions: false,
      videoPreview: false
    });
  });

  it('shows AIDA protocol details only in an AIDA context', () => {
    expect(reviewSections({ source: 'metrics-only', access: 'public', hasAidaContext: true }).aidaProtocol).toBe(true);
    expect(reviewSections({ source: 'metrics-only', access: 'public', hasAidaContext: false }).aidaProtocol).toBe(false);
  });
});

describe('validateReviewMetrics', () => {
  const captured = { capturedDistanceM: 75, capturedDurationSeconds: 72 };

  it('accepts captured values and smaller corrections', () => {
    expect(validateReviewMetrics({ ...captured, distanceM: 74.5, durationSeconds: 71 })).toEqual({
      valid: true,
      distanceM: 74.5,
      durationSeconds: 71
    });
  });

  it.each([
    ['distance-negative', { distanceM: -1, durationSeconds: 72 }],
    ['distance-too-large', { distanceM: 75.5, durationSeconds: 72 }],
    ['duration-negative', { distanceM: 75, durationSeconds: -1 }],
    ['duration-too-large', { distanceM: 75, durationSeconds: 73 }]
  ] as const)('rejects %s', (error, values) => {
    expect(validateReviewMetrics({ ...captured, ...values })).toMatchObject({ valid: false, error });
  });
});

describe('reviewSaveStatus', () => {
  it('does not claim upload completion while uploading', () => {
    expect(reviewSaveStatus('saved-uploading')).toEqual({
      label: 'Dive saved',
      detail: 'Video uploading',
      canRetryUpload: false,
      canCompleteLog: true
    });
  });

  it('keeps a saved dive recoverable after an upload failure', () => {
    expect(reviewSaveStatus('saved-upload-failed')).toMatchObject({
      label: 'Dive saved',
      canRetryUpload: true,
      canCompleteLog: true
    });
  });

  it('uses one public primary action label for every source', () => {
    expect(reviewPrimaryActionLabel()).toBe('Save dive');
  });
});
