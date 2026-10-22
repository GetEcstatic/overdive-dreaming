/**
 * Choosing the audio track to keep. Shared by the web app and the Cloud
 * Functions bundle, so keep it free of imports.
 *
 * iPhones from the 16 on record spatial audio (APAC) as a second track
 * beside the stereo AAC one. FFmpeg cannot decode APAC (it probes with no
 * codec name), and mapping every audio track then fails the whole encode.
 */

export interface ProbedStream {
  readonly codec_type?: string;
  readonly codec_name?: string;
}

/** Position among the audio tracks (for `0:a:N`) of the first one FFmpeg can decode, or null. */
export function decodableAudioIndex(streams: readonly ProbedStream[] | undefined): number | null {
  const audio = (streams ?? []).filter((stream) => stream.codec_type === 'audio');
  const index = audio.findIndex((stream) => Boolean(stream.codec_name) && stream.codec_name !== 'none');
  return index >= 0 ? index : null;
}
