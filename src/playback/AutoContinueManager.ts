import { Track } from '../core/types';

export type RecommendationSignals = {
  liked: Track[];
  history: { track: Track; playedAt: number }[];
  searches?: string[];
  recentIds: ReadonlySet<string>;
  suppressedIds: ReadonlySet<string>;
};

export type CandidateSource = {
  related: (track: Track, signal: AbortSignal) => Promise<Track[]>;
  search: (query: string, signal: AbortSignal) => Promise<Track[]>;
  canPlay: (track: Track) => boolean;
};

type CandidateOrigin = 'context' | 'related' | 'artistSearch' | 'intentSearch' | 'albumSearch';
export type DiscoveryCandidate = { track: Track; origin: CandidateOrigin };
export type RankedContinuation = { track: Track; score: number; reasons: string[] };
export type RankContext = {
  query?: string;
  session?: Track[];
  manualChoices?: Track[];
  skippedArtists?: ReadonlyMap<string, number>;
  allowSameArtistRun?: boolean;
};

const BUFFER_SIZE = 4;
const IMMEDIATE_SIZE = 2;
const POOL_SIZE = 50;

function normalized(value?: string): string {
  return (value ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function songKey(track: Track): string {
  const fullTitle = normalized(track.title);
  const title = fullTitle
    .replace(/\b(official (music )?(audio|video)|lyric(s)? video)\b/g, '')
    .replace(/\s+/g, ' ').trim() || fullTitle;
  return `${normalized(track.artist.name)}|${title}`;
}

function queryMatches(track: Track, query: string): boolean {
  const words = normalized(query).split(' ').filter((word) => word.length > 2);
  const metadata = normalized(`${track.title} ${track.artist.name} ${track.album ?? ''}`);
  return words.some((word) => metadata.includes(word));
}

/** History supplies affinity and a replay penalty, never candidate identities. */
export function rankContinuationDetailed(
  seed: Track,
  candidates: DiscoveryCandidate[],
  excluded: ReadonlySet<string>,
  signals: RecommendationSignals,
  canPlay: (track: Track) => boolean,
  limit = BUFFER_SIZE,
  context: RankContext = {}
): RankedContinuation[] {
  const seedArtist = normalized(seed.artist.name);
  const seedAlbum = normalized(seed.album);
  const likedArtists = new Set(signals.liked.map((track) => normalized(track.artist.name)));
  const historyIds = new Set(signals.history.map((entry) => entry.track.id));
  const recentSongKeys = new Set(signals.history
    .filter((entry) => entry.playedAt >= Date.now() - 12 * 60 * 60 * 1000)
    .map((entry) => songKey(entry.track)));
  const historyArtists = new Map<string, number>();
  for (const entry of signals.history) {
    const artist = normalized(entry.track.artist.name);
    historyArtists.set(artist, (historyArtists.get(artist) ?? 0) + 1);
  }
  const sessionArtists = new Set((context.session ?? []).slice(-5).map((track) => normalized(track.artist.name)));
  const manualArtists = new Set((context.manualChoices ?? []).slice(-5).map((track) => normalized(track.artist.name)));
  const sourceWeight: Record<CandidateOrigin, number> = {
    related: 7, context: 4, albumSearch: 3, intentSearch: 2, artistSearch: 2,
  };

  // A title/artist identity avoids recommending alternate uploads of one song.
  const bySong = new Map<string, { track: Track; origins: Set<CandidateOrigin>; index: number }>();
  candidates.forEach(({ track, origin }, index) => {
    if (!track?.id || !track.sourceId || !track.title || !canPlay(track)) return;
    if (track.id === seed.id || excluded.has(track.id)) return;
    if (signals.recentIds.has(track.id) || signals.suppressedIds.has(track.id)) return;
    const key = songKey(track);
    if (key === songKey(seed) || recentSongKeys.has(key)) return;
    const existing = bySong.get(key);
    if (existing) existing.origins.add(origin);
    else if (bySong.size < POOL_SIZE) bySong.set(key, { track, origins: new Set([origin]), index });
  });

  const scored = [...bySong.values()].map(({ track, origins, index }) => {
    const artist = normalized(track.artist.name);
    const album = normalized(track.album);
    const reasons: string[] = [];
    let score = Math.max(...[...origins].map((origin) => sourceWeight[origin]));
    reasons.push(origins.has('related') ? 'provider-related discovery' :
      origins.has('context') ? 'current search context' : 'metadata search discovery');
    if (origins.size > 1) { score += 1; reasons.push('multiple discovery sources'); }
    if (artist === seedArtist) { score += 5; reasons.push('current artist'); }
    if (seedAlbum && album && album === seedAlbum) { score += 4; reasons.push('same album'); }
    if (context.query && queryMatches(track, context.query)) { score += 2; reasons.push('current search intent'); }
    if (artist !== seedArtist && sessionArtists.has(artist)) { score += 2; reasons.push('current-session artist'); }
    if (manualArtists.has(artist)) { score += 2; reasons.push('manual choice affinity'); }
    if (likedArtists.has(artist)) { score += 1; reasons.push('liked artist affinity'); }
    if (signals.searches?.slice(0, 5).some((query) => queryMatches(track, query))) {
      score += 0.5; reasons.push('recent search affinity');
    }
    if (historyArtists.has(artist)) { score += Math.min(1, historyArtists.get(artist)! * 0.25); reasons.push('historical artist affinity'); }
    if (historyIds.has(track.id)) { score -= 2; reasons.push('previously played penalty'); }
    else { score += 1; reasons.push('new to listening history'); }
    const skips = context.skippedArtists?.get(artist) ?? 0;
    if (skips) { score -= Math.min(6, skips * 3); reasons.push('recent skip penalty'); }
    score += (POOL_SIZE - index) / (POOL_SIZE * 100); // deterministic tie-break only
    return { track, score, reasons };
  });

  const bestScore = Math.max(0, ...scored.map((item) => item.score));
  // A weak search-result/history crossover should not enter the short buffer
  // merely because there are too few alternatives. Relevance comes first.
  const plausible = scored.filter((item) => item.score >= Math.max(4, bestScore * 0.55));
  const selected: RankedContinuation[] = [];
  while (plausible.length && selected.length < limit) {
    const adjusted = (item: RankedContinuation) => {
      if (context.allowSameArtistRun) return item.score;
      const artist = normalized(item.track.artist.name);
      const album = normalized(item.track.album);
      const previous = selected[selected.length - 1]?.track;
      const consecutive = previous && normalized(previous.artist.name) === artist ? 6 : 0;
      const repeated = selected.some((entry) => normalized(entry.track.artist.name) === artist) ? 3 : 0;
      const sameAlbum = album && selected.some((entry) => normalized(entry.track.album) === album) ? 1 : 0;
      return item.score - consecutive - repeated - sameAlbum;
    };
    plausible.sort((a, b) => adjusted(b) - adjusted(a) || a.track.id.localeCompare(b.track.id));
    const chosen = plausible.shift()!;
    const adjustedScore = adjusted(chosen);
    if (adjustedScore < chosen.score) chosen.reasons.push('diversity adjustment');
    chosen.score = adjustedScore;
    selected.push(chosen);
  }
  return selected;
}

/** Compatibility wrapper for already discovered context candidates. */
export function rankContinuation(
  seed: Track,
  candidates: Track[],
  excluded: ReadonlySet<string>,
  signals: RecommendationSignals,
  canPlay: (track: Track) => boolean,
  limit = BUFFER_SIZE
): Track[] {
  return rankContinuationDetailed(
    seed, candidates.map((track) => ({ track, origin: 'context' })),
    excluded, signals, canPlay, limit
  ).map(({ track }) => ({ ...track, isAutoSuggested: true }));
}

/** A small rolling buffer, seeded by the current track and real provider discovery. */
export class AutoContinueManager {
  private generation = 0;
  private controller: AbortController | null = null;
  private seed: Track | null = null;
  private query = '';
  private contextCandidates: Track[] = [];
  private session: Track[] = [];
  private manualChoices: Track[] = [];
  private skippedArtists = new Map<string, number>();
  private rejectedIds = new Set<string>();
  private advancesSinceSelection = 0;

  constructor(private readonly source: CandidateSource) {}
  get seedId(): string | null { return this.seed?.id ?? null; }

  /** An explicit selection starts a new session and cancels stale discovery. */
  start(seed: Track, candidates: Track[] = [], query = ''): void {
    this.cancel();
    this.seed = seed;
    this.contextCandidates = candidates.slice(0, 20);
    this.query = query.trim();
    this.session = [seed];
    this.manualChoices = [];
    this.skippedArtists.clear();
    this.rejectedIds.clear();
    this.advancesSinceSelection = 0;
  }

  /** Queue and automatic transitions retain the current session's intent. */
  advance(seed: Track): void {
    this.cancel();
    this.seed = seed;
    this.session = [...this.session, seed].slice(-6);
    this.advancesSinceSelection++;
    if (this.advancesSinceSelection >= 3) this.contextCandidates = [];
    if (this.advancesSinceSelection >= 4) this.query = '';
  }

  noteManual(tracks: Track[]): void {
    this.manualChoices = [...this.manualChoices, ...tracks].slice(-6);
  }

  noteSkip(track: Track): void {
    this.rejectedIds.add(track.id);
    const artist = normalized(track.artist.name);
    this.skippedArtists.set(artist, (this.skippedArtists.get(artist) ?? 0) + 1);
  }

  cancel(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
  }

  private rank(candidates: DiscoveryCandidate[], excluded: ReadonlySet<string>, signals: RecommendationSignals, limit: number): Track[] {
    if (!this.seed) return [];
    const context: RankContext = {
      query: this.query, session: this.session, manualChoices: this.manualChoices,
      skippedArtists: this.skippedArtists,
    };
    return rankContinuationDetailed(
      this.seed, candidates, new Set([...excluded, ...this.rejectedIds]),
      signals, this.source.canPlay, limit, context
    ).map(({ track }) => ({ ...track, isAutoSuggested: true }));
  }

  /** Up to two search-context choices make cold-start Next usable immediately. */
  immediate(excluded: ReadonlySet<string>, signals: RecommendationSignals): Track[] {
    return this.rank(this.contextCandidates.map((track) => ({ track, origin: 'context' })), excluded, signals, IMMEDIATE_SIZE);
  }

  async refill(excluded: ReadonlySet<string>, signals: RecommendationSignals, limit = BUFFER_SIZE): Promise<Track[]> {
    const seed = this.seed;
    if (!seed) return [];
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    const candidates: DiscoveryCandidate[] = this.contextCandidates.map((track) => ({ track, origin: 'context' }));
    try {
      const related = await this.source.related(seed, controller.signal);
      candidates.push(...related.slice(0, 25).map((track) => ({ track, origin: 'related' as const })));
    } catch { /* provider discovery is best effort */ }
    if (controller.signal.aborted || generation !== this.generation) return [];

    // Bound network work to one artist search plus, for a narrow pool, one
    // originating-intent or album search. History is never searched directly.
    const artistQuery = seed.artist.name.trim();
    if (artistQuery) {
      try {
        const found = await this.source.search(artistQuery, controller.signal);
        candidates.push(...found.slice(0, 20).map((track) => ({ track, origin: 'artistSearch' as const })));
      } catch { /* keep related candidates */ }
    }
    if (controller.signal.aborted || generation !== this.generation) return [];
    const secondQuery = this.query && normalized(this.query) !== normalized(artistQuery)
      ? this.query : seed.album?.trim();
    if (new Set(candidates.filter(({ track }) => track.id !== seed.id).map(({ track }) => songKey(track))).size < 20 &&
        secondQuery && normalized(secondQuery) !== normalized(artistQuery)) {
      try {
        const found = await this.source.search(secondQuery, controller.signal);
        const origin = secondQuery === this.query ? 'intentSearch' as const : 'albumSearch' as const;
        candidates.push(...found.slice(0, 20).map((track) => ({ track, origin })));
      } catch { /* keep earlier discoveries */ }
    }
    if (controller.signal.aborted || generation !== this.generation) return [];
    this.controller = null;
    return this.rank(candidates, excluded, signals, limit);
  }
}
