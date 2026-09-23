import { describe, expect, it } from 'vitest';
import { Track } from '../../core/types';
import { AutoContinueManager, rankContinuation, RecommendationSignals } from '../AutoContinueManager';

const track = (id: string, artist = 'Artist'): Track => ({
  id, sourceId: id, provider: 'youtube', title: id, artist: { id: artist, name: artist },
  albumImageUrl: '', duration: 180,
});
const emptySignals: RecommendationSignals = {
  liked: [], history: [], recentIds: new Set(), suppressedIds: new Set(),
};

describe('Auto Continue', () => {
  it('cold-starts from search context without likes or history', () => {
    const manager = new AutoContinueManager({
      related: async () => [], search: async () => [], canPlay: () => true,
    });
    manager.start(track('A'), [track('B'), track('C'), track('D')], 'salar');
    expect(manager.immediate(new Set(['A']), emptySignals).map((item) => item.id)).toEqual(['B', 'C', 'D']);
  });

  it('deduplicates, suppresses recent and invalid candidates by stable id', () => {
    const signals = { ...emptySignals, recentIds: new Set(['C']), suppressedIds: new Set(['D']) };
    const result = rankContinuation(track('A'), [track('A'), track('B'), track('B'), track('C'), track('D'), track('E')], new Set(['E']), signals, () => true);
    expect(result.map((item) => item.id)).toEqual(['B']);
  });

  it('discards stale discovery after explicit new seed', async () => {
    let finishOld!: (tracks: Track[]) => void;
    const manager = new AutoContinueManager({
      related: (seed) => seed.id === 'A' ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve([track('Y')]),
      search: async () => [], canPlay: () => true,
    });
    manager.start(track('A'));
    const old = manager.refill(new Set(['A']), emptySignals);
    manager.start(track('Z'));
    finishOld([track('B')]);
    expect(await old).toEqual([]);
    expect((await manager.refill(new Set(['Z']), emptySignals)).map((item) => item.id)).toEqual(['Y']);
  });

  it('uses provider search when related candidates are empty', async () => {
    const manager = new AutoContinueManager({
      related: async () => [], search: async () => [track('B'), track('C')], canPlay: () => true,
    });
    manager.start(track('A'));
    expect((await manager.refill(new Set(['A']), emptySignals)).map((item) => item.id)).toEqual(['B', 'C']);
  });
});
