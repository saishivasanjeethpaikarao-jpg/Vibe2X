import { Track } from '../core/types';

export type RecommendationSignals = {
  liked: Track[];
  history: { track: Track; playedAt: number }[];
  recentIds: ReadonlySet<string>;
  suppressedIds: ReadonlySet<string>;
};

export type CandidateSource = {
  related: (track: Track, signal: AbortSignal) => Promise<Track[]>;
  search: (query: string, signal: AbortSignal) => Promise<Track[]>;
  canPlay: (track: Track) => boolean;
};

const BUFFER_SIZE = 4;

/** Stable, local ranking. Provider discovery supplies candidates, never playback order. */
export function rankContinuation(
  seed: Track,
  candidates: Track[],
  excluded: ReadonlySet<string>,
  signals: RecommendationSignals,
  canPlay: (track: Track) => boolean,
  limit = BUFFER_SIZE
): Track[] {
  const liked = new Set(signals.liked.map((track) => track.id));
  const listens = new Map<string, number>();
  for (const entry of signals.history) {
    listens.set(entry.track.id, (listens.get(entry.track.id) ?? 0) + 1);
  }
  const seedArtist = seed.artist.name.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  return candidates
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => {
      if (!track?.id || !track.sourceId || !track.title || !canPlay(track)) return false;
      if (track.id === seed.id || excluded.has(track.id) || seen.has(track.id)) return false;
      if (signals.recentIds.has(track.id) || signals.suppressedIds.has(track.id)) return false;
      seen.add(track.id);
      return true;
    })
    .map(({ track, index }) => ({
      track,
      index,
      score: (track.artist.name.trim().toLocaleLowerCase() === seedArtist ? 5 : 0) +
        (liked.has(track.id) ? 3 : 0) + Math.min(2, listens.get(track.id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ track }) => ({ ...track, isAutoSuggested: true }));
}

/** Cancels stale discovery when the user picks a different playback seed. */
export class AutoContinueManager {
  private generation = 0;
  private controller: AbortController | null = null;
  private seed: Track | null = null;
  private query = '';
  private contextCandidates: Track[] = [];

  constructor(private readonly source: CandidateSource) {}

  get seedId(): string | null { return this.seed?.id ?? null; }

  start(seed: Track, candidates: Track[] = [], query = ''): void {
    this.cancel();
    this.seed = seed;
    this.contextCandidates = candidates;
    this.query = query.trim();
  }

  cancel(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
  }

  /** Search results already on hand make cold-start Next available immediately. */
  immediate(excluded: ReadonlySet<string>, signals: RecommendationSignals): Track[] {
    return this.seed
      ? rankContinuation(this.seed, [
          ...this.contextCandidates,
          ...signals.liked,
          ...signals.history.map((entry) => entry.track),
        ], excluded, signals, this.source.canPlay)
      : [];
  }

  async refill(excluded: ReadonlySet<string>, signals: RecommendationSignals, limit = BUFFER_SIZE): Promise<Track[]> {
    const seed = this.seed;
    if (!seed) return [];
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;

    let related: Track[] = [];
    try {
      related = await this.source.related(seed, controller.signal);
    } catch { /* discovery is best effort */ }
    if (controller.signal.aborted || generation !== this.generation) return [];

    let candidates = [
      ...this.contextCandidates,
      ...related,
      ...signals.liked,
      ...signals.history.map((entry) => entry.track),
    ];
    if (rankContinuation(seed, candidates, excluded, signals, this.source.canPlay, limit).length < limit) {
      try {
        const query = this.query || seed.artist.name || seed.title;
        candidates = [...candidates, ...await this.source.search(query, controller.signal)];
      } catch { /* existing candidates can still be used */ }
    }
    if (controller.signal.aborted || generation !== this.generation) return [];
    this.controller = null;
    return rankContinuation(seed, candidates, excluded, signals, this.source.canPlay, limit);
  }
}
