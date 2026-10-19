/** Pure model for the post-capture Review & save flow. */

export type ReviewCaptureSource = 'video' | 'import' | 'metrics-only' | 'static-metrics-only';
export type ReviewAccess = 'public' | 'advanced' | 'admin';

export interface ReviewContext {
  source: ReviewCaptureSource;
  access: ReviewAccess;
  hasAidaContext: boolean;
}

export interface ReviewSections {
  /** The only correction section shown in the default public flow. */
  readonly correctResult: true;
  readonly importedMarkers: boolean;
  readonly aidaProtocol: boolean;
  readonly diagnostics: boolean;
  readonly advancedActions: boolean;
  readonly videoPreview: boolean;
}

export type ReviewSaveState =
  | 'idle'
  | 'saving'
  | 'saved-uploading'
  | 'saved-offline'
  | 'saved-ready'
  | 'saved-upload-failed'
  | 'saved-metrics';

export interface ReviewSaveStatus {
  readonly label: string;
  readonly detail: string;
  readonly canRetryUpload: boolean;
  readonly canCompleteLog: boolean;
}

export interface ReviewMetricInput {
  capturedDistanceM: number;
  capturedDurationSeconds: number;
  distanceM: number;
  durationSeconds: number;
}

export interface ReviewMetricValidation {
  readonly valid: boolean;
  readonly distanceM: number;
  readonly durationSeconds: number;
  readonly error?: 'distance-negative' | 'distance-too-large' | 'duration-negative' | 'duration-too-large';
}

/** Derive which sections belong on the review surface for this capture. */
export function reviewSections(context: ReviewContext): ReviewSections {
  const isVideo = context.source === 'video' || context.source === 'import';
  return {
    correctResult: true,
    importedMarkers: context.source === 'import',
    aidaProtocol: context.hasAidaContext,
    diagnostics: context.access !== 'public' && isVideo,
    advancedActions: context.access !== 'public' && isVideo,
    videoPreview: isVideo
  };
}

/**
 * Keep corrections trustworthy: users can reduce a captured result, but cannot
 * claim a larger result than the capture recorded.
 */
export function validateReviewMetrics(input: ReviewMetricInput): ReviewMetricValidation {
  if (input.distanceM < 0) {
    return { valid: false, distanceM: input.distanceM, durationSeconds: input.durationSeconds, error: 'distance-negative' };
  }
  if (input.distanceM > input.capturedDistanceM) {
    return { valid: false, distanceM: input.distanceM, durationSeconds: input.durationSeconds, error: 'distance-too-large' };
  }
  if (input.durationSeconds < 0) {
    return { valid: false, distanceM: input.distanceM, durationSeconds: input.durationSeconds, error: 'duration-negative' };
  }
  if (input.durationSeconds > input.capturedDurationSeconds) {
    return { valid: false, distanceM: input.distanceM, durationSeconds: input.durationSeconds, error: 'duration-too-large' };
  }
  return { valid: true, distanceM: input.distanceM, durationSeconds: input.durationSeconds };
}

/** Copy and actions for the saved hand-off, independent of UI components. */
export function reviewSaveStatus(state: ReviewSaveState): ReviewSaveStatus {
  switch (state) {
    case 'idle':
      return { label: 'Ready to save', detail: 'Your dive has not been saved yet.', canRetryUpload: false, canCompleteLog: false };
    case 'saving':
      return { label: 'Saving your dive…', detail: 'Keep this screen open for a moment.', canRetryUpload: false, canCompleteLog: false };
    case 'saved-uploading':
      return { label: 'Dive saved', detail: 'Video uploading', canRetryUpload: false, canCompleteLog: true };
    case 'saved-offline':
      return { label: 'Dive saved', detail: 'Video will upload when you’re back online.', canRetryUpload: true, canCompleteLog: true };
    case 'saved-ready':
      return { label: 'Dive saved', detail: 'Video ready', canRetryUpload: false, canCompleteLog: true };
    case 'saved-upload-failed':
      return { label: 'Dive saved', detail: 'Video upload needs attention.', canRetryUpload: true, canCompleteLog: true };
    case 'saved-metrics':
      return { label: 'Dive saved', detail: 'No video upload is needed.', canRetryUpload: false, canCompleteLog: true };
  }
}

/** The default public primary action is deliberately source-independent. */
export function reviewPrimaryActionLabel(): 'Save dive' {
  return 'Save dive';
}
