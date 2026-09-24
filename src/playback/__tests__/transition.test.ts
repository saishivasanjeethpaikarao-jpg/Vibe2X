import { describe, expect, it, vi } from 'vitest';
import {
  feedbackFor,
  LONG_WAIT_FEEDBACK_MS,
  PlaybackTransition,
  PREPARING_FEEDBACK_MS,
  shouldSkipFailedCandidate,
} from '../transition';
import { PlaybackTiming } from '../timing';

describe('playback transition feedback', () => {
  it('keeps instant transitions invisible and reveals real waits progressively', () => {
    expect(feedbackFor('resolving', PREPARING_FEEDBACK_MS - 1)).toBe('hidden');
    expect(feedbackFor('preparing', PREPARING_FEEDBACK_MS)).toBe('preparing');
    expect(feedbackFor('buffering', LONG_WAIT_FEEDBACK_MS)).toBe('long');
    expect(feedbackFor('playing', LONG_WAIT_FEEDBACK_MS)).toBe('hidden');
    expect(feedbackFor('failed', 0)).toBe('failed');
  });

  it('coalesces duplicate taps and rejects late completion after a newer selection', () => {
    const transition = new PlaybackTransition();
    const a = transition.begin('A');
    expect(a).not.toBeNull();
    expect(transition.begin('A')).toBeNull();
    const b = transition.begin('B');
    expect(b).not.toBeNull();
    expect(transition.advance(a!, 'playing')).toBe(false);
    expect(transition.isCurrent(b!)).toBe(true);
    expect(transition.advance(b!, 'playing')).toBe(true);
  });

  it('allows Retry after failure and latest intent wins across rapid Next requests', () => {
    const transition = new PlaybackTransition();
    const b = transition.begin('B')!;
    const c = transition.begin('C')!;
    const d = transition.begin('D')!;
    expect(transition.advance(b, 'playing')).toBe(false);
    expect(transition.advance(c, 'playing')).toBe(false);
    expect(transition.advance(d, 'failed')).toBe(true);
    const retry = transition.begin('D');
    expect(retry).not.toBeNull();
    expect(transition.advance(retry!, 'playing')).toBe(true);
  });

  it('skips a failed automatic candidate to the next item, with a bounded limit', () => {
    expect(shouldSkipFailedCandidate('playback_failed', true, true, 0, 3)).toBe(true);
    expect(shouldSkipFailedCandidate('playback_failed', false, true, 0, 3)).toBe(false);
    expect(shouldSkipFailedCandidate('network', true, true, 0, 3)).toBe(false);
    expect(shouldSkipFailedCandidate('source_unavailable', true, false, 0, 3)).toBe(false);
    expect(shouldSkipFailedCandidate('track_unavailable', true, true, 3, 3)).toBe(false);
  });

  it('records stage durations without a URL, title, or credentials', () => {
    let now = 1_000;
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const timing = new PlaybackTiming(true, () => now, 900);
    timing.mark('resolverStart');
    now = 1_140;
    timing.mark('resolverComplete');
    now = 1_300;
    timing.mark('nativeLoadStart');
    now = 1_600;
    timing.mark('nativeReady');
    now = 1_720;
    timing.mark('firstPlaying');
    const result = timing.finish('playing');
    expect(result).toMatchObject({
      intent: 0, resolverStart: 100, resolverComplete: 240,
      nativeLoadStart: 400, nativeReady: 700, firstPlaying: 820,
      outcome: 'playing', preloaded: true,
    });
    expect(JSON.stringify(result)).not.toContain('https');
    log.mockRestore();
  });
});
