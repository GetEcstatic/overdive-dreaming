/**
 * FFmpeg filter graph for the social cut (plan docs/video/social-cut-implementation.md
 * §3–§4). Pure string building, shared with the Cloud Functions bundle: only
 * relative imports.
 *
 * Input 0 is the recording, seeked to `inputStartMs` (so trims are relative
 * to it). Input 1 is the HUD frame sequence over output time.
 */

import type { SocialCutEditDecisionList } from './shareHud/socialCut';
import type { SocialVideoPlacement } from './shareHud/socialCanvas';

export const SOCIAL_AUDIO_FADE_S = 0.15;
const AUDIO_FORMAT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';

export interface SocialCutFilterArgs {
  readonly edl: SocialCutEditDecisionList;
  /** Where the input was seeked to (`-ss`), source ms. */
  readonly inputStartMs: number;
  readonly placement: SocialVideoPlacement;
  /** Display rotation filters (e.g. `transpose=1`), applied after the cut. */
  readonly rotation: readonly string[];
  readonly canvas: { readonly width: number; readonly height: number };
  readonly background: string;
  readonly fps: number;
  readonly hasAudio: boolean;
}

export interface SocialCutFilter {
  readonly filterComplex: string;
  readonly videoLabel: string;
  readonly audioLabel: string | null;
  readonly outputSeconds: number;
}

function s(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3);
}

export function socialCutFilter(args: SocialCutFilterArgs): SocialCutFilter {
  const { edl, placement: p, canvas } = args;
  const segments = edl.segments;
  const n = segments.length;
  const rel = (ms: number) => s(ms - args.inputStartMs);
  const parts: string[] = [];

  // Video: cut and retime each piece, join, then drop frames before the expensive rotate/scale.
  parts.push(`[0:v]split=${n}${segments.map((_, i) => `[vs${i}]`).join('')}`);
  segments.forEach((seg, i) => {
    const pts = seg.speed === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${seg.speed}`;
    parts.push(`[vs${i}]trim=start=${rel(seg.fromMs)}:end=${rel(seg.toMs)},setpts=${pts}[vc${i}]`);
  });
  const place =
    p.mode === 'cover'
      ? []
      : [`pad=${canvas.width}:${canvas.height}:${p.x}:${p.y}:color=${args.background.replace('#', '0x')}`];
  const chain = [
    `concat=n=${n}:v=1:a=0`,
    `fps=${args.fps}`,
    ...args.rotation,
    `scale=${p.scaleW}:${p.scaleH}:flags=lanczos`,
    `crop=${p.cropW}:${p.cropH}:${p.cropX}:${p.cropY}`,
    ...place,
    'setsar=1',
    `tpad=stop_mode=clone:stop_duration=${s(edl.cardDurationMs)}`
  ];
  parts.push(`${segments.map((_, i) => `[vc${i}]`).join('')}${chain.join(',')}[base]`);
  parts.push('[1:v]format=rgba[hud]');
  parts.push('[base][hud]overlay=0:0:shortest=1,format=yuv420p[v]');

  // Audio: original sound at 1× with short fades at every join; silence while fast-forwarding and under the card.
  let audioLabel: string | null = null;
  if (args.hasAudio) {
    const oneX = segments.map((seg, i) => ({ seg, i })).filter(({ seg }) => seg.speed === 1);
    if (oneX.length > 0) parts.push(`[0:a]asplit=${oneX.length}${oneX.map(({ i }) => `[as${i}]`).join('')}`);
    segments.forEach((seg, i) => {
      const durMs = (seg.toMs - seg.fromMs) / seg.speed;
      if (seg.speed === 1) {
        const fade = Math.min(SOCIAL_AUDIO_FADE_S, durMs / 2000);
        parts.push(
          `[as${i}]atrim=start=${rel(seg.fromMs)}:end=${rel(seg.toMs)},asetpts=PTS-STARTPTS,${AUDIO_FORMAT},` +
            `afade=t=in:st=0:d=${fade.toFixed(3)},afade=t=out:st=${Math.max(0, durMs / 1000 - fade).toFixed(3)}:d=${fade.toFixed(3)}[ap${i}]`
        );
      } else {
        parts.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${s(durMs)},${AUDIO_FORMAT}[ap${i}]`);
      }
    });
    parts.push(`${segments.map((_, i) => `[ap${i}]`).join('')}concat=n=${n}:v=0:a=1,apad=whole_dur=${s(edl.outputDurationMs)}[a]`);
    audioLabel = '[a]';
  }

  return { filterComplex: parts.join(';'), videoLabel: '[v]', audioLabel, outputSeconds: edl.outputDurationMs / 1000 };
}
