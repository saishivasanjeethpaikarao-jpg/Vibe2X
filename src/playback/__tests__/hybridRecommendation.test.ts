import { describe, expect, it } from 'vitest';
import { Track } from '../../core/types';
import { DEFAULT_MUSIC_PREFERENCES } from '../../core/musicPreferences';
import { AutoContinueManager, rankContinuationDetailed } from '../AutoContinueManager';
import { RecommendationReranker, validateRankedIds } from '../RecommendationReranker';

const track = (id: string, title: string, artist: string, album?: string): Track => ({
  id: `youtube:${id}`, sourceId: id, provider: 'youtube', title, artist: { id: artist, name: artist }, album,
  albumImageUrl: '', duration: 190,
});
const seed = track('seed', 'Soft English Song', 'Indie Artist', 'Indie Album');
const prefs = { ...DEFAULT_MUSIC_PREFERENCES, languages: ['Telugu', 'Hindi'], favoriteArtists: [
  { artistId: 'fav', name: 'Telugu Artist', provider: 'youtube' },
] };
const empty = { liked: [], history: [], recentIds: new Set<string>(), suppressedIds: new Set<string>() };

describe('hybrid Smart Continue', () => {
  it('keeps current-song relevance ahead of conflicting taste and history', () => {
    const english = track('english', 'Related Song', 'Indie Artist', 'Indie Album');
    const telugu = track('telugu', 'Old Telugu Hit', 'Telugu Artist');
    const ranks = rankContinuationDetailed(seed, [
      { track: telugu, origin: 'favoriteArtistSearch' }, { track: english, origin: 'related' },
    ], new Set(), { ...empty, preferences: prefs, history: [{ track: telugu, playedAt: Date.now() - 86400000 }] }, () => true);
    expect(ranks[0].track.id).toBe(english.id);
    expect(ranks[0].reasons).toContain('current artist');
  });
  it('accepts only supplied, unique structured AI IDs', () => {
    const allowed = new Set(['a', 'b']);
    expect(validateRankedIds({ tracks: [{ candidateId: 'b', score: 0.9 }] }, allowed)).toEqual(['b']);
    expect(validateRankedIds({ tracks: [{ candidateId: 'invented', score: 1 }] }, allowed)).toBeNull();
    expect(validateRankedIds({ tracks: [{ candidateId: 'a', score: 1 }, { candidateId: 'a', score: 0.8 }] }, allowed)).toBeNull();
    expect(validateRankedIds({ tracks: [{ candidateId: 'a', score: 'high' }] }, allowed)).toBeNull();
  });
  it('uses deterministic candidates when AI times out or returns malformed output', async () => {
    const candidate = track('related', 'Another Indie Song', 'Indie Artist');
    const second = track('related-2', 'New Related Indie Song', 'Another Indie Artist');
    let attempted = false;
    const failing: RecommendationReranker = { rerank: async () => { attempted = true; throw new Error('timeout'); } };
    const manager = new AutoContinueManager({ related: async () => [candidate, second], search: async () => [], canPlay: () => true }, failing);
    manager.start(seed);
    const result = await manager.refill(new Set([seed.id]), { ...empty, preferences: prefs, useAIReranking: true });
    expect(attempted).toBe(true);
    expect(result.map((item) => item.id)).toContain(candidate.id);
    expect(result.map((item) => item.id)).toContain(second.id);
  });
  it('rejects a current-song alternate upload before model ranking', async () => {
    const duplicate = track('duplicate', 'Soft English Song Lyrics', 'Indie Artist');
    const related = track('related', 'New Indie Song', 'Indie Artist');
    const another = track('another', 'Another Indie Song', 'Different Artist');
    let supplied: string[] = [];
    const spy: RecommendationReranker = { rerank: async (_context, candidates) => {
      supplied = candidates.map((item) => item.track.id); return supplied;
    } };
    const manager = new AutoContinueManager({ related: async () => [duplicate, related, another], search: async () => [], canPlay: () => true }, spy);
    manager.start(seed);
    const result = await manager.refill(new Set([seed.id]), { ...empty, useAIReranking: true });
    expect(result.map((item) => item.id)).toContain(related.id);
    expect(result.map((item) => item.id)).toContain(another.id);
    expect(supplied).not.toContain(duplicate.id);
  });
  it('does not let an unknown mocked AI ID replace valid provider tracks', async () => {
    const one = track('one', 'New Indie Song', 'Indie Artist');
    const two = track('two', 'New Related Song', 'Indie Artist');
    const bad: RecommendationReranker = { rerank: async () => ['invented'] };
    const manager = new AutoContinueManager({ related: async () => [one, two], search: async () => [], canPlay: () => true }, bad);
    manager.start(seed);
    const result = await manager.refill(new Set([seed.id]), { ...empty, useAIReranking: true });
    expect(result.map((item) => item.id)).toEqual(expect.arrayContaining([one.id, two.id]));
    expect(result.map((item) => item.id)).not.toContain('invented');
  });
});
