import { describe, expect, it } from 'vitest';
import { socialCutEditList } from './shareHud/socialCut';
import { socialVideoPlacement } from './shareHud/socialCanvas';
import { socialCutFilter } from './socialCutFilter';

const edl = socialCutEditList({
  diveStartMs: 10_000,
  diveEndMs: 175_000,
  wallsMs: [50_000, 95_000, 140_000],
  pbCrossedAtMs: null,
  recordingDurationMs: 200_000,
  timelineProtocolEndMs: 185_000
});
const base = {
  edl,
  inputStartMs: 8_000,
  rotation: [] as string[],
  canvas: { width: 1080, height: 1920 },
  background: '#0b1220',
  fps: 30,
  hasAudio: true
};

describe('socialCutFilter', () => {
  it('cuts every segment relative to the input seek and retimes fast-forward', () => {
    const { filterComplex } = socialCutFilter({ ...base, placement: socialVideoPlacement({ width: 1080, height: 1920 }) });
    expect(filterComplex).toContain(`[0:v]split=${edl.segments.length}`);
    expect(filterComplex).toContain('[vs0]trim=start=0.000:end=5.000,setpts=PTS-STARTPTS[vc0]');
    expect(filterComplex).toContain('[vs1]trim=start=5.000:end=40.500,setpts=(PTS-STARTPTS)/12[vc1]');
    expect(filterComplex).toContain(`concat=n=${edl.segments.length}:v=1:a=0,fps=30,scale=1080:1920`);
    expect(filterComplex).toContain('tpad=stop_mode=clone:stop_duration=3.000');
    expect(filterComplex).not.toContain('pad=1080:1920:');
  });

  it('pads landscape footage into the band on the navy canvas', () => {
    const { filterComplex } = socialCutFilter({ ...base, placement: socialVideoPlacement({ width: 1920, height: 1080 }) });
    expect(filterComplex).toMatch(/scale=1080:608:flags=lanczos,crop=1080:608:0:0,pad=1080:1920:0:\d+:color=0x0b1220/);
  });

  it('rotates after the cut, before scaling', () => {
    const { filterComplex } = socialCutFilter({ ...base, rotation: ['transpose=1'], placement: socialVideoPlacement({ width: 1080, height: 1920 }) });
    expect(filterComplex).toContain('fps=30,transpose=1,scale=');
  });

  it('keeps sound at 1× with fades and silences fast-forward', () => {
    const { filterComplex, audioLabel } = socialCutFilter({ ...base, placement: socialVideoPlacement({ width: 1080, height: 1920 }) });
    expect(audioLabel).toBe('[a]');
    const oneX = edl.segments.filter((seg) => seg.speed === 1).length;
    expect(filterComplex).toContain(`[0:a:0]asplit=${oneX}`);
    expect(filterComplex).toContain('afade=t=in:st=0:d=0.150,afade=t=out:st=4.850:d=0.150[ap0]');
    expect(filterComplex).toMatch(/anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=2\.958/);
    expect(filterComplex).toContain(`apad=whole_dur=${(edl.outputDurationMs / 1000).toFixed(3)}[a]`);
  });

  it('has no audio graph for silent sources', () => {
    const result = socialCutFilter({ ...base, hasAudio: false, placement: socialVideoPlacement({ width: 1080, height: 1920 }) });
    expect(result.audioLabel).toBeNull();
    expect(result.filterComplex).not.toContain('[0:a');
  });

  it('uses the chosen audio track (skipping iPhone spatial audio)', () => {
    const { filterComplex } = socialCutFilter({ ...base, audioStream: 1, placement: socialVideoPlacement({ width: 1080, height: 1920 }) });
    expect(filterComplex).toContain('[0:a:1]asplit=');
  });
});
