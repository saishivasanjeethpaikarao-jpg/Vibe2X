import { describe, expect, it } from 'vitest';
import { Track } from '../../core/types';
import {
  AutoContinueManager,
  DiscoveryCandidate,
  rankContinuationDetailed,
  RecommendationSignals,
} from '../AutoContinueManager';

const track = (id: string, title: string, artist: string, album?: string): Track => ({
  id: `youtube:${id}`, sourceId: id, provider: 'youtube', title,
  artist: { id: artist, name: artist }, album, albumImageUrl: '', duration: 190,
});
const seed = track('seed', 'Soft Hindi Song', 'Hindi Artist', 'Romantic Film');
const empty: RecommendationSignals = {
  liked: [], history: [], recentIds: new Set(), suppressedIds: new Set(),
};
const candidate = (item: Track, origin: DiscoveryCandidate['origin'] = 'related'): DiscoveryCandidate => ({ track: item, origin });
const rank = (items: DiscoveryCandidate[], signals = empty, context = {}) =>
  rankContinuationDetailed(seed, items, new Set([seed.id]), signals, () => true, 5, context);

describe('Smart Continue V2 quality fixtures (synthetic, no provider calls)', () => {
  it('discovers tracks for a zero-history user from the current seed', async () => {
    const related = [
      track('h1', 'Another Soft Song', 'Related Hindi Artist', 'Romantic Film'),
      track('h2', 'A Gentle Melody', 'Another Artist'),
      track('h3', 'New Song', 'Hindi Artist'),
    ];
    const manager = new AutoContinueManager({ related: async () => related, search: async () => [], canPlay: () => true });
    manager.start(seed);
    const result = await manager.refill(new Set([seed.id]), empty);
    expect(result.length).toBe(3);
    expect(result.every((item) => item.isAutoSuggested)).toBe(true);
    expect(result.map((item) => item.id)).not.toContain(seed.id);
  });

  it('does not use 100 history tracks as a candidate pool', async () => {
    const history = Array.from({ length: 100 }, (_, index) => ({
      track: track(`old-${index}`, `Telugu Hit ${index}`, 'Telugu Artist'),
      playedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    }));
    const signals = { ...empty, history };
    const newTrack = track('new', 'New Soft Song', 'Related Hindi Artist');
    const manager = new AutoContinueManager({ related: async () => [newTrack], search: async () => [], canPlay: () => true });
    manager.start(seed);
    expect((await manager.refill(new Set([seed.id]), signals)).map((item) => item.id)).toEqual([newTrack.id]);
    const noDiscovery = new AutoContinueManager({ related: async () => [], search: async () => [], canPlay: () => true });
    noDiscovery.start(seed);
    expect(await noDiscovery.refill(new Set([seed.id]), signals)).toEqual([]);
  });

  it('follows a Hindi soft session despite conflicting Telugu history', () => {
    const oldTelugu = track('old', 'Energetic Telugu Song', 'Telugu Artist');
    const hindi = track('new-hindi', 'Gentle Romantic Song', 'Related Hindi Artist', 'Romantic Film');
    const signals = { ...empty, history: Array.from({ length: 20 }, (_, i) => ({
      track: i === 0 ? oldTelugu : track(`old-${i}`, `Telugu Hit ${i}`, 'Telugu Artist'),
      playedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    })) };
    const result = rank([candidate(oldTelugu, 'context'), candidate(hindi)], signals, { query: 'Hindi romantic' });
    expect(result[0].track.id).toBe(hindi.id);
    expect(result[0].reasons).toContain('provider-related discovery');
    expect(result.map((item) => item.track.id)).not.toContain(oldTelugu.id);
  });

  it('keeps a multilingual session tied to provider relations, not script guesses', async () => {
    const teluguSeed = track('telugu-seed', 'మెల్లగా', 'Telugu Artist', 'Telugu Film');
    const teluguRelated = track('telugu-new', 'కొత్త పాట', 'Related Telugu Artist', 'Telugu Film');
    const crossLanguageRelated = track('tamil-new', 'புதிய பாடல்', 'Related Tamil Artist');
    const hindiHistory = track('hindi-old', 'Old Hindi Hit', 'Hindi Artist');
    const manager = new AutoContinueManager({
      related: async () => [teluguRelated, crossLanguageRelated],
      search: async () => [], canPlay: () => true,
    });
    manager.start(teluguSeed);
    const result = await manager.refill(new Set([teluguSeed.id]), {
      ...empty,
      history: [{ track: hindiHistory, playedAt: Date.now() - 7 * 24 * 60 * 60 * 1000 }],
    });
    expect(result.map((item) => item.id)).toEqual([teluguRelated.id, crossLanguageRelated.id]);
    expect(result.map((item) => item.id)).not.toContain(hindiHistory.id);
  });

  it('excludes a track played two songs ago, including an alternate upload', () => {
    const recentlyPlayed = track('original', 'Beautiful Song', 'Related Artist');
    const alternate = track('alternate', 'Beautiful Song (Official Audio)', 'Related Artist');
    const other = track('other', 'Fresh Song', 'Another Artist');
    const signals = { ...empty, history: [{ track: recentlyPlayed, playedAt: Date.now() - 90_000 }] };
    expect(rank([candidate(alternate), candidate(other)], signals).map((item) => item.track.id)).toEqual([other.id]);
  });

  it('does not add the same logical song from related results beside an already queued upload', () => {
    const queued = track('queued', 'Bairan', 'Banjaare');
    const duplicate = track('other-upload', 'BAIRAN (LYRICS)', 'Banjaare');
    const fresh = track('fresh', 'Another Song', 'Banjaare');
    const result = rankContinuationDetailed(seed, [candidate(duplicate), candidate(fresh)],
      new Set([seed.id, queued.id]), { ...empty, excludedSongKeys: new Set(['banjaare|bairan']) }, () => true);
    expect(result.map((entry) => entry.track.id)).toEqual([fresh.id]);
  });

  it('varies artists without losing the current vibe', () => {
    const result = rank([
      candidate(track('same1', 'Song One', 'Hindi Artist')),
      candidate(track('same2', 'Song Two', 'Hindi Artist')),
      candidate(track('same3', 'Song Three', 'Hindi Artist')),
      candidate(track('related', 'Related Song', 'Related Hindi Artist')),
    ]);
    expect(result[0].track.artist.name).toBe('Hindi Artist');
    expect(result[1].track.artist.name).toBe('Related Hindi Artist');
  });

  it('uses current-session and manual choices more strongly than old history', () => {
    const sessionArtist = track('session', 'Session Match', 'Session Artist');
    const oldArtist = track('history', 'Old Match', 'Historical Artist');
    const manualArtist = track('manual', 'Manual Match', 'Chosen Artist');
    const signals = { ...empty, history: [{ track: oldArtist, playedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }] };
    const result = rank([
      candidate(oldArtist), candidate(sessionArtist), candidate(manualArtist),
    ], signals, {
      session: [track('previous', 'Earlier Song', 'Session Artist')],
      manualChoices: [track('chosen', 'User Queue Choice', 'Chosen Artist')],
    });
    expect(result.slice(0, 2).map((item) => item.track.id)).toContain(sessionArtist.id);
    expect(result.slice(0, 2).map((item) => item.track.id)).toContain(manualArtist.id);
    expect(result[0].reasons.some((reason) => reason.includes('affinity') || reason.includes('session'))).toBe(true);
  });

  it('boosts a newly liked artist and penalizes repeated skips', () => {
    const liked = track('liked', 'Liked Artist New Song', 'Liked Artist');
    const skipped = track('skipped', 'Skipped Artist New Song', 'Skipped Artist');
    const neutral = track('neutral', 'Neutral New Song', 'Neutral Artist');
    const signals = { ...empty, liked: [track('like-source', 'Earlier Favorite', 'Liked Artist')] };
    const result = rank([candidate(skipped), candidate(neutral), candidate(liked)], signals, {
      skippedArtists: new Map([['skipped artist', 2]]),
    });
    expect(result[0].track.id).toBe(liked.id);
    expect(result.map((item) => item.track.id)).not.toContain(skipped.id);
    expect(result[0].reasons).toContain('liked artist affinity');
  });

  it('preserves originating search intent after advancing through the session', async () => {
    const queries: string[] = [];
    const manager = new AutoContinueManager({
      related: async () => [],
      search: async (query) => { queries.push(query); return []; },
      canPlay: () => true,
    });
    manager.start(seed, [], 'Hindi romantic songs');
    manager.advance(track('next', 'Another Song', 'Related Artist'));
    await manager.refill(new Set(), empty);
    expect(queries).toContain('Related Artist');
    expect(queries).toContain('Hindi romantic songs');
  });

  it('lets old search context expire as the session moves to a new vibe', async () => {
    const oldResult = track('old-result', 'Old Search Result', 'Old Artist');
    const newResult = track('new-result', 'New Related Song', 'New Artist');
    const manager = new AutoContinueManager({ related: async () => [newResult], search: async () => [], canPlay: () => true });
    manager.start(seed, [oldResult], 'Hindi romantic songs');
    manager.advance(track('one', 'One', 'One Artist'));
    manager.advance(track('two', 'Two', 'Two Artist'));
    manager.advance(track('three', 'Three', 'Three Artist'));
    const result = await manager.refill(new Set(), empty);
    expect(result.map((item) => item.id)).toEqual([newResult.id]);
  });

  it('replenishes a consumed buffer without looping to prior tracks', async () => {
    const pool = ['B', 'C', 'D', 'E', 'F'].map((id) => track(id, `Song ${id}`, `Artist ${id}`));
    const manager = new AutoContinueManager({ related: async () => pool, search: async () => [], canPlay: () => true });
    manager.start(seed);
    const first = await manager.refill(new Set([seed.id]), empty, 4);
    expect(first).toHaveLength(4);
    const consumed = first[0];
    manager.advance(consumed);
    const next = await manager.refill(new Set([seed.id, ...first.map((item) => item.id)]), empty, 2);
    expect(next.map((item) => item.id)).toEqual([pool.find((item) => !first.some((earlier) => earlier.id === item.id))!.id]);
  });

  it('uses a manual choice as an immediate session affinity and rejects skipped ids', async () => {
    const neutral = track('neutral-choice', 'Neutral Song', 'Neutral Artist');
    const chosen = track('chosen-choice', 'Related New Song', 'Chosen Artist');
    const manager = new AutoContinueManager({ related: async () => [neutral, chosen], search: async () => [], canPlay: () => true });
    manager.start(seed);
    manager.noteManual([track('manual-choice', 'User Chose This', 'Chosen Artist')]);
    expect((await manager.refill(new Set([seed.id]), empty))[0].id).toBe(chosen.id);
    manager.noteSkip(chosen);
    expect((await manager.refill(new Set([seed.id]), empty)).map((item) => item.id)).not.toContain(chosen.id);
  });

  it('reports explainable scores for synthetic QA review', () => {
    const discovered = track('discovered', 'Romantic Film Song', 'Related Hindi Artist', 'Romantic Film');
    const discovered2 = track('discovered-2', 'Another Gentle Song', 'Another Hindi Artist');
    const familiar = track('familiar', 'Old Telugu Song', 'Telugu Artist');
    const signals = { ...empty, history: [{ track: familiar, playedAt: Date.now() - 5 * 24 * 60 * 60 * 1000 }] };
    const result = rank([candidate(familiar, 'context'), candidate(discovered), candidate(discovered2)], signals, { query: 'Hindi romantic' });
    expect(result[0].track.id).toBe(discovered.id);
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[0].reasons).toContain('new to listening history');
    expect(result.map((item) => item.track.id)).not.toContain(familiar.id);
    console.info('[recommendation-qa-fixture]', result.map(({ track: item, score, reasons }) => ({ id: item.id, score, reasons })));
  });
});
