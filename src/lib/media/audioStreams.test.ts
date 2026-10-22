import { describe, expect, it } from 'vitest';
import { decodableAudioIndex } from './audioStreams';

describe('decodableAudioIndex', () => {
  it('skips the iPhone spatial audio track wherever it sits', () => {
    const aacFirst = [{ codec_type: 'audio', codec_name: 'aac' }, { codec_type: 'audio' }, { codec_type: 'video', codec_name: 'h264' }];
    const apacFirst = [{ codec_type: 'video', codec_name: 'h264' }, { codec_type: 'audio', codec_name: 'none' }, { codec_type: 'audio', codec_name: 'aac' }];
    expect(decodableAudioIndex(aacFirst)).toBe(0);
    expect(decodableAudioIndex(apacFirst)).toBe(1);
  });

  it('returns null with no usable audio', () => {
    expect(decodableAudioIndex([{ codec_type: 'video', codec_name: 'h264' }])).toBeNull();
    expect(decodableAudioIndex([{ codec_type: 'audio' }])).toBeNull();
    expect(decodableAudioIndex(undefined)).toBeNull();
  });
});
