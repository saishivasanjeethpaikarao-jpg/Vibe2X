import { describe, expect, it } from 'vitest';
import { Track } from '../../core/types';
import { AutoContinueManager, rankContinuationDetailed, RecommendationSignals } from '../AutoContinueManager';

const track = (id: string, title: string, artist: string, language: string, album = ''): Track => ({
  id: `youtube:${id}`, sourceId: id, provider: 'youtube', title,
  artist: { id: artist, name: artist }, language, album, duration: 210, albumImageUrl: '',
});
const empty: RecommendationSignals = { liked: [], history: [], recentIds: new Set(), suppressedIds: new Set() };

describe('confirmed Smart Continue quality blockers', () => {
  it('rejects title keyword collisions and duplicate uploads before ranking', () => {
    const seed = track('ori', 'Ori Vaari', 'Santhosh Narayanan', 'Telugu', 'Dasara');
    const result = rankContinuationDetailed(seed, [
      { track: track('lyrics', 'Ori Vari Lyrics', 'Santhosh Narayanan', 'Telugu', 'Dasara'), origin: 'related' },
      { track: track('repost', 'Ori Vari Official Audio', 'Another Channel', 'Telugu', 'Dasara'), origin: 'related' },
      { track: track('collision', 'Ori Vari Topic News', 'Unrelated Creator', 'Telugu'), origin: 'context' },
      { track: track('new', 'Different Telugu Melody', 'Related Artist', 'Telugu'), origin: 'related' },
    ], new Set(), empty, () => true);
    expect(result.map(({ track: item }) => item.sourceId)).toEqual(['new']);
  });

  it('does not fill a buffer with a single movie/topic, and known language mismatch loses', () => {
    const seed = track('film-seed', 'A Hindi Film Song', 'Singer A', 'Hindi', 'Film X');
    const candidates = [
      ...[1, 2, 3, 4].map((index) => ({ track: track(`film-${index}`, `Film X song ${index}`, `Film Singer ${index}`, 'Hindi', 'Film X'), origin: 'related' as const })),
      ...[1, 2, 3].map((index) => ({ track: track(`fit-${index}`, `Soft melody ${index}`, `Related Singer ${index}`, 'Hindi', `Different ${index}`), origin: 'related' as const })),
      { track: track('urdu', 'Unrelated track', 'Other Singer', 'Urdu'), origin: 'related' as const },
    ];
    const result = rankContinuationDetailed(seed, candidates, new Set(), empty, () => true, 5);
    expect(result.filter(({ track: item }) => item.album === 'Film X').length).toBeLessThanOrEqual(1);
    expect(result.some(({ track: item }) => item.sourceId === 'urdu')).toBe(false);
    expect(result.slice(0, 3).every(({ track: item }) => item.language === 'Hindi')).toBe(true);
  });

  it('runs ten multilingual seed fixtures with 20+ synthetic candidates each', async () => {
    // These are deterministic ranking fixtures, not claims about live provider
    // results or real-world musical similarity.
    const seeds = [
      ['Ori Vaari', 'Santhosh Narayanan', 'Telugu'],
      ['Kesariya', 'Arijit Singh', 'Hindi'],
      ['Why This Kolaveri Di', 'Anirudh Ravichander', 'Tamil'],
      ['Malare', 'Vijay Yesudas', 'Malayalam'],
      ['Believer', 'Imagine Dragons', 'English'],
      ['Naatu Naatu', 'Rahul Sipligunj', 'Telugu'],
      ['Apna Bana Le', 'Arijit Singh', 'Hindi'],
      ['Jee Karda', 'Divya Kumar', 'Punjabi'],
      ['Raataan Lambiyan', 'Jubin Nautiyal', 'Hindi'],
      ['Varaha Roopam', 'Sai Vignesh', 'Kannada'],
    ] as const;
    for (const [index, [title, artist, language]] of seeds.entries()) {
      const seed = track(`seed-${index}`, title, artist, language, `Album ${index}`);
      const related = [
        track(`same-${index}`, `Different song by ${artist}`, artist, language),
        ...Array.from({ length: 7 }, (_, i) => track(`fit-${index}-${i}`, `Related melody ${i}`, `Related Artist ${i}`, language, `Discovery ${i}`)),
        ...Array.from({ length: 4 }, (_, i) => track(`topic-${index}-${i}`, `Album ${index} topic ${i}`, `Topic Artist ${i}`, language, `Album ${index}`)),
        ...Array.from({ length: 4 }, (_, i) => track(`wrong-${index}-${i}`, `Unrelated music ${i}`, `Other Artist ${i}`, 'Other')),
        track(`duplicate-${index}`, `${title} Lyrics`, artist, language, `Album ${index}`),
      ];
      const context = Array.from({ length: 10 }, (_, i) => track(`keyword-${index}-${i}`, `${title} news ${i}`, `News Channel ${i}`, language));
      const manager = new AutoContinueManager({ related: async () => related, search: async () => [], canPlay: () => true });
      manager.start(seed, context, title);
      const selected = await manager.refill(new Set([seed.id]), empty, 5);
      expect(manager.diagnostics?.candidateCount).toBeGreaterThanOrEqual(20);
      expect(selected.length).toBeGreaterThanOrEqual(3);
      expect(selected.every((item) => item.language === language)).toBe(true);
      expect(selected.every((item) => !item.title.includes('news') && !item.title.includes('Lyrics'))).toBe(true);
      console.info('[ten-seed-QA-fixture]', JSON.stringify({ seed: title, language,
        candidateCount: manager.diagnostics?.candidateCount,
        hardFilterRemovals: manager.diagnostics?.hardFilterRemovals,
        mode: manager.diagnostics?.fallbackReason,
        selected: manager.diagnostics?.selected.map((item) => ({ title: item.title, source: item.sourceCandidateType, reasons: item.reasons })) }));
    }
  });
});
