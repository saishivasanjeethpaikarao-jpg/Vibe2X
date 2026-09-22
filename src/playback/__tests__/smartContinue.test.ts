import { describe, expect, it } from 'vitest';
import { chooseSmartContinue, mayStartSmartContinue } from '../smartContinue';
import { Track } from '../../core/types';

function mockTrack(id: string, opts?: Partial<Track>): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: { id: `artist-${id}`, name: opts?.artist?.name ?? `Artist ${id}` },
    albumImageUrl: '',
    duration: 180,
    provider: 'youtube' as const,
    sourceId: id,
    ...opts,
  };
}

describe('chooseSmartContinue', () => {
  it('only enables continuation at a completed, empty, allowed queue boundary', () => {
    const ready = { trackCompleted: true, hasUpcoming: false, enabled: true, sleepTimerExpired: false };
    expect(mayStartSmartContinue(ready)).toBe(true);
    expect(mayStartSmartContinue({ ...ready, trackCompleted: false })).toBe(false);
    expect(mayStartSmartContinue({ ...ready, hasUpcoming: true })).toBe(false);
    expect(mayStartSmartContinue({ ...ready, enabled: false })).toBe(false);
    expect(mayStartSmartContinue({ ...ready, sleepTimerExpired: true })).toBe(false);
  });
  it('returns auto-suggested tracks', () => {
    const current = mockTrack('A');
    const listens = [{ track: mockTrack('B'), playedAt: 100 }];
    const result = chooseSmartContinue(current, listens, [], new Set());

    expect(result.length).toBe(1);
    expect(result[0].isAutoSuggested).toBe(true);
    expect(result[0].id).toBe('B');
  });

  it('excludes current song', () => {
    const current = mockTrack('A');
    const listens = [
      { track: mockTrack('A'), playedAt: 100 },
      { track: mockTrack('B'), playedAt: 101 },
    ];
    const result = chooseSmartContinue(current, listens, [], new Set());

    expect(result.map(t => t.id)).not.toContain('A');
    expect(result.map(t => t.id)).toContain('B');
  });

  it('excludes tracks in excludedIds set', () => {
    const current = mockTrack('A');
    const listens = [
      { track: mockTrack('B'), playedAt: 100 },
      { track: mockTrack('C'), playedAt: 101 },
    ];
    const excludedIds = new Set(['B']);
    const result = chooseSmartContinue(current, listens, [], excludedIds);

    expect(result.map(t => t.id)).toEqual(['C']);
  });

  it('scores artist matches higher', () => {
    const current = mockTrack('A', { artist: { id: 'artist-1', name: 'The Beatles' } });
    const listens = [
      { track: mockTrack('B', { artist: { id: 'artist-2', name: 'The Rolling Stones' } }), playedAt: 101 },
      { track: mockTrack('C', { artist: { id: 'artist-1', name: 'The Beatles' } }), playedAt: 100 },
    ];
    // Even though B was played more recently, C matches the artist and should score higher
    const result = chooseSmartContinue(current, listens, [], new Set());

    expect(result[0].id).toBe('C');
    expect(result[1].id).toBe('B');
  });

  it('scores liked songs higher', () => {
    const current = mockTrack('A');
    const listens = [
      { track: mockTrack('B'), playedAt: 101 },
    ];
    const liked = [mockTrack('C')];
    // C is liked (score 3), B is in history (score 0), C should be first
    const result = chooseSmartContinue(current, listens, liked, new Set());

    expect(result[0].id).toBe('C');
    expect(result[1].id).toBe('B');
  });

  it('deterministic output', () => {
    const current = mockTrack('A');
    const listens = [
      { track: mockTrack('B'), playedAt: 100 },
      { track: mockTrack('C'), playedAt: 100 },
    ];
    // Both score 0, both playedAt 100. Fallback is localeCompare of ID.
    // 'B' comes before 'C'
    const result1 = chooseSmartContinue(current, listens, [], new Set());
    const result2 = chooseSmartContinue(current, listens, [], new Set());

    expect(result1.map(t => t.id)).toEqual(['B', 'C']);
    expect(result2.map(t => t.id)).toEqual(['B', 'C']);
  });

  it('empty history and liked returns empty', () => {
    const current = mockTrack('A');
    const result = chooseSmartContinue(current, [], [], new Set());
    expect(result).toEqual([]);
  });

  it('respects limit parameter', () => {
    const current = mockTrack('A');
    const listens = [
      { track: mockTrack('B'), playedAt: 100 },
      { track: mockTrack('C'), playedAt: 101 },
      { track: mockTrack('D'), playedAt: 102 },
      { track: mockTrack('E'), playedAt: 103 },
    ];
    const result = chooseSmartContinue(current, listens, [], new Set(), 2);

    expect(result.length).toBe(2);
    // E and D were played most recently (highest lastPlayed)
    expect(result.map(t => t.id)).toEqual(['E', 'D']);
  });

  it('frequency scoring: tracks appearing multiple times in history score higher', () => {
    const current = mockTrack('A');
    const listens = [
      { track: mockTrack('B'), playedAt: 100 },
      { track: mockTrack('C'), playedAt: 101 },
      { track: mockTrack('B'), playedAt: 102 }, // B appears again, gets previous score bump
    ];
    const result = chooseSmartContinue(current, listens, [], new Set());

    // B has previous? 1 : 0 -> gets score 1, C has score 0
    expect(result[0].id).toBe('B');
    expect(result[1].id).toBe('C');
  });
});
