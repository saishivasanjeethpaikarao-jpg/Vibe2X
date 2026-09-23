import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Track } from '../../core/types';

const native = vi.hoisted(() => {
  const listeners = new Set<(status: unknown) => void>();
  const player = {
    volume: 1,
    replace: vi.fn(), play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(async () => undefined),
    addListener: vi.fn((_name: string, listener: (status: unknown) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
    setActiveForLockScreen: vi.fn(), clearLockScreenControls: vi.fn(), remove: vi.fn(),
  };
  return { listeners, player };
});

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-audio', () => ({
  createAudioPlayer: () => native.player,
  setAudioModeAsync: async () => undefined,
  setIsAudioActiveAsync: async () => undefined,
}));

import { PlaybackEngine } from '../PlaybackEngine';

const track = (id: string): Track => ({
  id, sourceId: id, provider: 'youtube', title: id, artist: { id, name: id },
  albumImageUrl: '', duration: 180,
});
const stream = { url: 'https://example.test/audio', expiresAt: Date.now() + 60_000, resolvedBy: 'test' };

describe('PlaybackEngine transition confirmation', () => {
  beforeEach(() => {
    native.listeners.clear();
    vi.clearAllMocks();
  });

  it('does not finish a load before the native player confirms playing', async () => {
    const engine = new PlaybackEngine();
    let finished = false;
    const loading = engine.load(track('A'), stream).then(() => { finished = true; });
    await vi.waitFor(() => expect(native.player.play).toHaveBeenCalledTimes(1));
    expect(finished).toBe(false);
    native.listeners.forEach((listener) => listener({ isLoaded: true, playing: true, currentTime: 0, duration: 180 }));
    await loading;
    expect(finished).toBe(true);
    await engine.release();
  });

  it('rejects a superseded native activation instead of promoting an old track', async () => {
    const engine = new PlaybackEngine();
    const old = engine.load(track('A'), stream);
    await vi.waitFor(() => expect(native.player.play).toHaveBeenCalledTimes(1));
    const newer = engine.load(track('B'), stream);
    await expect(old).rejects.toThrow();
    await vi.waitFor(() => expect(native.player.play).toHaveBeenCalledTimes(2));
    native.listeners.forEach((listener) => listener({ isLoaded: true, playing: true, currentTime: 0, duration: 180 }));
    await newer;
    expect(engine.trackId).toBe('B');
    await engine.release();
  });
});
