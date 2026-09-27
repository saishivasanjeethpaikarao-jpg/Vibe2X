import { Track } from '../core/types';
import { logicalSongKey, sameLogicalRecording } from '../core/logicalSong';
import { MusicPreferences } from '../core/musicPreferences';
import { RecommendationReranker, RerankContext } from './RecommendationReranker';
import { publishRecommendationQA, RecommendationQA } from './recommendationQA';

export type RecommendationSignals = {
  liked: Track[];
  history: { track: Track; playedAt: number }[];
  searches?: string[];
  recentIds: ReadonlySet<string>;
  suppressedIds: ReadonlySet<string>;
  excludedSongKeys?: ReadonlySet<string>;
  excludedTracks?: readonly Track[];
  preferences?: MusicPreferences;
  useAIReranking?: boolean;
};

export type CandidateSource = {
  related: (track: Track, signal: AbortSignal) => Promise<Track[]>;
  search: (query: string, signal: AbortSignal) => Promise<Track[]>;
  canPlay: (track: Track) => boolean;
};

type CandidateOrigin = 'context' | 'related' | 'artistSearch' | 'sessionArtistSearch' | 'intentSearch' | 'albumSearch' | 'favoriteArtistSearch';
export type DiscoveryCandidate = { track: Track; origin: CandidateOrigin };
export type RankedContinuation = { track: Track; score: number; reasons: string[]; sourceCandidateType: CandidateOrigin[] };
export type RankContext = {
  query?: string;
  session?: Track[];
  manualChoices?: Track[];
  skippedArtists?: ReadonlyMap<string, number>;
  allowSameArtistRun?: boolean;
  allowSameAlbumRun?: boolean;
};

const BUFFER_SIZE = 4;
const IMMEDIATE_SIZE = 2;
const POOL_SIZE = 50;

function normalized(value?: string): string {
  return (value ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function artistIntentMatches(track: Track, query: string): boolean {
  const artist = normalized(track.artist.name);
  const intent = normalized(query);
  return artist.length >= 4 && intent.length >= 4 && (intent.includes(artist) || artist === intent);
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
  const recentTracks = signals.history.filter((entry) => entry.playedAt >= Date.now() - 12 * 60 * 60 * 1000).map((entry) => entry.track);
  const recentSongKeys = new Set(recentTracks.map(logicalSongKey));
  const historyArtists = new Map<string, number>();
  for (const entry of signals.history) {
    const artist = normalized(entry.track.artist.name);
    historyArtists.set(artist, (historyArtists.get(artist) ?? 0) + 1);
  }
  const sessionArtists = new Set((context.session ?? []).slice(-5).map((track) => normalized(track.artist.name)));
  const manualArtists = new Set((context.manualChoices ?? []).slice(-5).map((track) => normalized(track.artist.name)));
  const sessionLanguages = (context.session ?? []).slice(-4).map((track) => normalized(track.language)).filter(Boolean);
  const currentLanguage = normalized(seed.language) || (sessionLanguages.length >= 2 && sessionLanguages.every((language) => language === sessionLanguages[0]) ? sessionLanguages[0] : '');
  const sourceWeight: Record<CandidateOrigin, number> = {
    related: 8, context: 2, albumSearch: 1, intentSearch: 2, artistSearch: 3, sessionArtistSearch: 4, favoriteArtistSearch: 1,
  };

  // A title/artist identity avoids recommending alternate uploads of one song.
  const bySong = new Map<string, { track: Track; origins: Set<CandidateOrigin>; index: number }>();
  candidates.forEach(({ track, origin }, index) => {
    if (!track?.id || !track.sourceId || !track.title || !canPlay(track)) return;
    if (track.id === seed.id || excluded.has(track.id)) return;
    if (signals.recentIds.has(track.id) || signals.suppressedIds.has(track.id)) return;
    const key = logicalSongKey(track);
    if (sameLogicalRecording(track, seed) || recentSongKeys.has(key) || signals.excludedSongKeys?.has(key) ||
        recentTracks.some((recent) => sameLogicalRecording(track, recent)) ||
        signals.excludedTracks?.some((queued) => sameLogicalRecording(track, queued))) return;
    const existing = bySong.get(key) ?? [...bySong.values()].find((item) => sameLogicalRecording(track, item.track));
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
    const currentArtist = artist === seedArtist;
    const sessionArtist = artist !== seedArtist && sessionArtists.has(artist);
    const manualArtist = manualArtists.has(artist);
    if (currentArtist) { score += 5; reasons.push('current artist'); }
    if (sessionArtist) { score += 4; reasons.push('current-session artist'); }
    if (manualArtist) { score += 3; reasons.push('manual choice affinity'); }
    if (seedAlbum && album && album === seedAlbum) {
      if (currentArtist) score += 1;
      reasons.push(currentArtist ? 'same artist and album' : 'album/topic not used as a relevance boost');
    }
    if (context.query && artistIntentMatches(track, context.query)) { score += 2; reasons.push('current artist search intent'); }
    const language = normalized(track.language);
    if (currentLanguage && language) {
      if (currentLanguage === language) { score += 3; reasons.push('current-session language'); }
      else { score -= 5; reasons.push('current-session language mismatch'); }
    } else if (!currentLanguage && language && signals.preferences?.languages.length) {
      if (signals.preferences.languages.some((preferred) => normalized(preferred) === language)) {
        score += 1; reasons.push('preferred language');
      }
    }
    if (likedArtists.has(artist)) { score += 1; reasons.push('liked artist affinity'); }
    if (signals.preferences?.favoriteArtists.some((favorite) => favorite.artistId === track.artist.id || normalized(favorite.name) === artist)) {
      score += 1; reasons.push('preferred artist affinity');
    }
    if (signals.searches?.slice(0, 5).some((query) => artistIntentMatches(track, query))) {
      score += 0.5; reasons.push('recent search affinity');
    }
    if (historyArtists.has(artist)) { score += Math.min(0.5, historyArtists.get(artist)! * 0.1); reasons.push('historical artist affinity'); }
    if (historyIds.has(track.id)) { score -= 4; reasons.push('previously played penalty'); }
    else { score += 1; reasons.push('new to listening history'); }
    const skips = context.skippedArtists?.get(artist) ?? 0;
    if (skips) { score -= Math.min(6, skips * 3); reasons.push('recent skip penalty'); }
    score += (POOL_SIZE - index) / (POOL_SIZE * 100); // deterministic tie-break only
    const related = origins.has('related');
    const artistRelated = currentArtist || sessionArtist || manualArtist;
    // Search can return unrelated videos that merely share a title word or
    // movie/topic. A provider relation is useful but album-only relations are
    // too weak to fill the small buffer by themselves.
    const plausibleRelation = artistRelated || related;
    return { track, score, reasons, sourceCandidateType: [...origins], plausibleRelation };
  });

  const bestScore = Math.max(0, ...scored.filter((item) => item.plausibleRelation).map((item) => item.score));
  // A weak search-result/history crossover should not enter the short buffer
  // merely because there are too few alternatives. Relevance comes first.
  const threshold = Math.max(6, bestScore * 0.6);
  const plausible = scored.filter((item) => item.plausibleRelation && item.score >= threshold);
  const selected: RankedContinuation[] = [];
  while (plausible.length && selected.length < limit) {
    const adjusted = (item: RankedContinuation) => {
      if (context.allowSameArtistRun) return item.score;
      const artist = normalized(item.track.artist.name);
      const album = normalized(item.track.album);
      const previous = selected[selected.length - 1]?.track;
      const artistCount = selected.filter((entry) => normalized(entry.track.artist.name) === artist).length;
      const consecutive = previous && normalized(previous.artist.name) === artist ? 4 : 0;
      const repeated = artistCount ? 2 + Math.max(0, artistCount - 1) * 6 : 0;
      const sameAlbum = !context.allowSameAlbumRun && album && selected.some((entry) => normalized(entry.track.album) === album) ? 8 : 0;
      return item.score - consecutive - repeated - sameAlbum;
    };
    plausible.sort((a, b) => adjusted(b) - adjusted(a) || a.track.id.localeCompare(b.track.id));
    const chosen = plausible.shift()!;
    const adjustedScore = adjusted(chosen);
    const onlySameArtistAvailable = selected.length === 1 &&
      normalized(chosen.track.artist.name) === normalized(selected[0].track.artist.name) &&
      !plausible.some((item) => normalized(item.track.artist.name) !== normalized(chosen.track.artist.name));
    if (adjustedScore < threshold && !onlySameArtistAvailable) break;
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
  private lastRecommendationQA: RecommendationQA | null = null;

  constructor(private readonly source: CandidateSource, private readonly reranker?: RecommendationReranker) {}
  get seedId(): string | null { return this.seed?.id ?? null; }
  get diagnostics(): RecommendationQA | null { return this.lastRecommendationQA; }

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
    this.lastRecommendationQA = null;
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
    const diagnostic: RecommendationQA = {
      aiEnabled: Boolean(signals.useAIReranking), endpointConfigured: Boolean(this.reranker),
      aiRequestSent: false, responseReceived: false, responseValid: false, aiOrderingApplied: false,
      fallbackUsed: true, fallbackReason: !signals.useAIReranking ? 'disabled' : !this.reranker ? 'endpoint_missing' : 'insufficient_candidates',
      candidateCount: candidates.length, filteredCandidateCount: deterministic.length,
      hardFilterRemovals: Math.max(0, candidates.length - deterministic.length), aiLatencyMs: null, selected: [],
    };
    if (this.reranker && signals.useAIReranking && deterministic.length > 1) {
      const rerankContext: RerankContext = {
        current: this.seed, session: this.session.slice(-3), searchQuery: this.query,
        languages: signals.preferences?.languages ?? [], favoriteArtists: signals.preferences?.favoriteArtists ?? [],
        likedArtists: signals.liked.slice(0, 5).map((track) => track.artist.name),
        skippedArtists: [...this.skippedArtists.keys()].slice(0, 5),
      };
      const started = Date.now();
      diagnostic.aiRequestSent = true;
      try {
        const ids = await this.reranker.rerank(rerankContext, deterministic.map(({ track, score }) => ({ track, score })), signal);
        diagnostic.responseReceived = true;
        const byId = new Map(deterministic.map((item) => [item.track.id, item]));
        if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
          throw new Error('invalid_ids');
        }
        diagnostic.responseValid = true;
        chosen = [...ids.map((id) => byId.get(id)).filter((item): item is typeof deterministic[number] => !!item),
          ...deterministic.filter((item) => !ids.includes(item.track.id))];
        diagnostic.aiOrderingApplied = true;
        diagnostic.fallbackUsed = false;
        diagnostic.fallbackReason = '';
      } catch (error) {
        diagnostic.fallbackReason = signal.aborted ? 'cancelled'
          : error instanceof Error && ['invalid_ids', 'invalid_response'].includes(error.message) ? 'invalid_response'
            : error instanceof Error && error.message === 'recommendation_http_429' ? 'rate_limited'
              : error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request_failed';
      }
      diagnostic.aiLatencyMs = Date.now() - started;
    }
    // Model output never bypasses the deterministic identity and queue filters.
    const seen = new Set<string>();
    const selected = chosen.filter(({ track }) => {
      const key = logicalSongKey(track);
      if (seen.has(key) || excludedAll.has(track.id) || signals.excludedSongKeys?.has(key) ||
          sameLogicalRecording(track, this.seed!) || signals.excludedTracks?.some((queued) => sameLogicalRecording(track, queued)) ||
          !this.source.canPlay(track)) return false;
      seen.add(key); return true;
    }).slice(0, limit);
    diagnostic.selected = selected.map(({ track, reasons, sourceCandidateType }, index) => ({
      trackId: track.id, title: track.title, sourceCandidateType,
      language: track.language ?? 'unknown', reasons,
      aiRank: diagnostic.aiOrderingApplied ? index + 1 : null,
    }));
    this.lastRecommendationQA = diagnostic;
    publishRecommendationQA(diagnostic);
    return selected.map(({ track }) => ({ ...track, isAutoSuggested: true }));
  }

  /** Only same-artist search context is safe to queue before provider discovery.
   * A title search often contains alternate uploads or unrelated keyword hits. */
  immediate(excluded: ReadonlySet<string>, signals: RecommendationSignals): Track[] {
    const artist = normalized(this.seed?.artist.name);
    return this.rank(this.contextCandidates.filter((track) => normalized(track.artist.name) === artist)
      .map((track) => ({ track, origin: 'context' })), excluded, signals, IMMEDIATE_SIZE);
  }

  async refill(excluded: ReadonlySet<string>, signals: RecommendationSignals, limit = BUFFER_SIZE): Promise<Track[]> {
    const seed = this.seed;
    if (!seed) return [];
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    const candidates: DiscoveryCandidate[] = this.contextCandidates.map((track) => ({ track, origin: 'context' }));
    const artistQuery = seed.artist.name.trim();
    const sessionArtist = [...this.session].reverse().find((track) =>
      normalized(track.artist.name) !== normalized(artistQuery))?.artist.name.trim();
    // Three bounded discovery sources run together, rather than waiting for
    // provider-related before starting the artist search. History is never a
    // direct candidate source.
    const primary = await Promise.allSettled([
      this.source.related(seed, controller.signal),
      artistQuery ? this.source.search(artistQuery, controller.signal) : Promise.resolve([]),
      sessionArtist ? this.source.search(sessionArtist, controller.signal) : Promise.resolve([]),
    ]);
    if (primary[0].status === 'fulfilled') candidates.push(...primary[0].value.slice(0, 25).map((track) => ({ track, origin: 'related' as const })));
    if (primary[1].status === 'fulfilled') candidates.push(...primary[1].value.slice(0, 20).map((track) => ({ track, origin: 'artistSearch' as const })));
    if (primary[2].status === 'fulfilled') candidates.push(...primary[2].value.slice(0, 20).map((track) => ({ track, origin: 'sessionArtistSearch' as const })));
    if (controller.signal.aborted || generation !== this.generation) return [];
    const secondQuery = this.query && normalized(this.query) !== normalized(artistQuery) &&
      normalized(this.query) !== normalized(seed.title) && normalized(this.query) !== normalized(seed.album)
      ? this.query : '';
    if (new Set(candidates.filter(({ track }) => track.id !== seed.id).map(({ track }) => logicalSongKey(track))).size < 20 &&
        secondQuery) {
      try {
        const found = await this.source.search(secondQuery, controller.signal);
        candidates.push(...found.slice(0, 20).map((track) => ({ track, origin: 'intentSearch' as const })));
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
    if (controller.signal.aborted || generation !== this.generation) return [];
    const ranked = await this.rankWithOptionalAI(candidates, excluded, signals, limit, controller.signal);
    if (this.controller === controller) this.controller = null;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && generation === this.generation) {
      console.info('[recommendations]', { discovered: candidates.length, finalCount: ranked.length });
    }
    return controller.signal.aborted || generation !== this.generation ? [] : ranked;
  }
}
