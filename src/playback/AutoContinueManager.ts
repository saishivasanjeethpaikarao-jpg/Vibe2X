import { Track } from '../core/types';
import { logicalSongKey } from '../core/logicalSong';
import { MusicPreferences } from '../core/musicPreferences';
import { RecommendationReranker, RerankContext } from './RecommendationReranker';

export type RecommendationSignals = {
  liked: Track[];
  history: { track: Track; playedAt: number }[];
  searches?: string[];
  recentIds: ReadonlySet<string>;
  suppressedIds: ReadonlySet<string>;
  excludedSongKeys?: ReadonlySet<string>;
  preferences?: MusicPreferences;
  useAIReranking?: boolean;
};

export type CandidateSource = {
  related: (track: Track, signal: AbortSignal) => Promise<Track[]>;
  search: (query: string, signal: AbortSignal) => Promise<Track[]>;
  canPlay: (track: Track) => boolean;
};

type CandidateOrigin = 'context' | 'related' | 'artistSearch' | 'intentSearch' | 'albumSearch' | 'favoriteArtistSearch';
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
    .map((entry) => logicalSongKey(entry.track)));
  const historyArtists = new Map<string, number>();
  for (const entry of signals.history) {
    const artist = normalized(entry.track.artist.name);
    historyArtists.set(artist, (historyArtists.get(artist) ?? 0) + 1);
  }
  const sessionArtists = new Set((context.session ?? []).slice(-5).map((track) => normalized(track.artist.name)));
  const manualArtists = new Set((context.manualChoices ?? []).slice(-5).map((track) => normalized(track.artist.name)));
  const sourceWeight: Record<CandidateOrigin, number> = {
    related: 7, context: 4, albumSearch: 3, intentSearch: 2, artistSearch: 2, favoriteArtistSearch: 1,
  };

  // A title/artist identity avoids recommending alternate uploads of one song.
  const bySong = new Map<string, { track: Track; origins: Set<CandidateOrigin>; index: number }>();
  candidates.forEach(({ track, origin }, index) => {
    if (!track?.id || !track.sourceId || !track.title || !canPlay(track)) return;
    if (track.id === seed.id || excluded.has(track.id)) return;
    if (signals.recentIds.has(track.id) || signals.suppressedIds.has(track.id)) return;
    const key = logicalSongKey(track);
    if (key === logicalSongKey(seed) || recentSongKeys.has(key) || signals.excludedSongKeys?.has(key)) return;
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
    if (signals.preferences?.favoriteArtists.some((favorite) => favorite.artistId === track.artist.id || normalized(favorite.name) === artist)) {
      score += 1; reasons.push('preferred artist affinity');
    }
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

  constructor(private readonly source: CandidateSource, private readonly reranker?: RecommendationReranker) {}
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

  private async rankWithOptionalAI(candidates: DiscoveryCandidate[], excluded: ReadonlySet<string>, signals: RecommendationSignals,
    limit: number, signal: AbortSignal): Promise<Track[]> {
    if (!this.seed) return [];
    const excludedAll = new Set([...excluded, ...this.rejectedIds]);
    const context: RankContext = { query: this.query, session: this.session, manualChoices: this.manualChoices, skippedArtists: this.skippedArtists };
    const deterministic = rankContinuationDetailed(this.seed, candidates, excludedAll, signals, this.source.canPlay, 30, context);
    let chosen = deterministic;
    if (this.reranker && signals.useAIReranking && deterministic.length > 1) {
      const rerankContext: RerankContext = {
        current: this.seed, session: this.session.slice(-3), searchQuery: this.query,
        languages: signals.preferences?.languages ?? [], favoriteArtists: signals.preferences?.favoriteArtists ?? [],
        likedArtists: signals.liked.slice(0, 5).map((track) => track.artist.name),
        skippedArtists: [...this.skippedArtists.keys()].slice(0, 5),
      };
      const started = Date.now();
      try {
        const ids = await this.reranker.rerank(rerankContext, deterministic.map(({ track, score }) => ({ track, score })), signal);
        const byId = new Map(deterministic.map((item) => [item.track.id, item]));
        chosen = [...ids.map((id) => byId.get(id)).filter((item): item is typeof deterministic[number] => !!item),
          ...deterministic.filter((item) => !ids.includes(item.track.id))];
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[recommendations]', { candidateCount: deterministic.length, aiMs: Date.now() - started, fallback: false });
      } catch {
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[recommendations]', { candidateCount: deterministic.length, aiMs: Date.now() - started, fallback: true });
      }
    }
    // Model output never bypasses the deterministic identity and queue filters.
    const seen = new Set<string>();
    return chosen.filter(({ track }) => {
      const key = logicalSongKey(track);
      if (seen.has(key) || excludedAll.has(track.id) || signals.excludedSongKeys?.has(key) ||
          key === logicalSongKey(this.seed!) || !this.source.canPlay(track)) return false;
      seen.add(key); return true;
    }).slice(0, limit).map(({ track }) => ({ ...track, isAutoSuggested: true }));
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
    if (new Set(candidates.filter(({ track }) => track.id !== seed.id).map(({ track }) => logicalSongKey(track))).size < 20 &&
        secondQuery && normalized(secondQuery) !== normalized(artistQuery)) {
      try {
        const found = await this.source.search(secondQuery, controller.signal);
        const origin = secondQuery === this.query ? 'intentSearch' as const : 'albumSearch' as const;
        candidates.push(...found.slice(0, 20).map((track) => ({ track, origin })));
      } catch { /* keep earlier discoveries */ }
    }
    if (controller.signal.aborted || generation !== this.generation) return [];
    // Favorite artists are a soft cold-start source only when provider/context
    // discovery is thin; never let old taste replace the current session.
    if (new Set(candidates.map(({ track }) => logicalSongKey(track))).size < 12) {
      const favorite = signals.preferences?.favoriteArtists.find((artist) => normalized(artist.name) !== normalized(seed.artist.name));
      if (favorite) {
        try {
          const found = await this.source.search(favorite.name, controller.signal);
          candidates.push(...found.slice(0, 12).map((track) => ({ track, origin: 'favoriteArtistSearch' as const })));
        } catch { /* preference discovery is best effort */ }
      }
    }
    if (new Set(candidates.map(({ track }) => logicalSongKey(track))).size < 6 && artistQuery && signals.preferences?.languages.length) {
      try {
        const query = `${artistQuery} ${signals.preferences.languages[0]} music`;
        const found = await this.source.search(query, controller.signal);
        candidates.push(...found.slice(0, 12).map((track) => ({ track, origin: 'intentSearch' as const })));
      } catch { /* language preference is never a hard requirement */ }
    }
    if (controller.signal.aborted || generation !== this.generation) return [];
    const ranked = await this.rankWithOptionalAI(candidates, excluded, signals, limit, controller.signal);
    if (this.controller === controller) this.controller = null;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && generation === this.generation) {
      console.info('[recommendations]', { discovered: candidates.length, finalCount: ranked.length });
    }
    return controller.signal.aborted || generation !== this.generation ? [] : ranked;
  }
}
