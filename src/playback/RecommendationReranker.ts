import { Track } from '../core/types';
import { FavoriteArtist } from '../core/musicPreferences';

export type RerankContext = {
  current: Track;
  session: Track[];
  searchQuery?: string;
  languages: string[];
  favoriteArtists: FavoriteArtist[];
  likedArtists: string[];
  skippedArtists: string[];
};

export type RerankCandidate = { track: Track; score: number };
export interface RecommendationReranker {
  rerank(context: RerankContext, candidates: RerankCandidate[], signal: AbortSignal): Promise<string[]>;
}

/** Unknown, repeated, or malformed model IDs invalidate the entire response. */
export function validateRankedIds(value: unknown, allowed: ReadonlySet<string>): string[] | null {
  if (!value || typeof value !== 'object' || !('tracks' in value) || !Array.isArray(value.tracks)) return null;
  const ids: string[] = [];
  for (const entry of value.tracks) {
    if (!entry || typeof entry !== 'object' || typeof entry.candidateId !== 'string' ||
        typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 1 ||
        !allowed.has(entry.candidateId) || ids.includes(entry.candidateId)) return null;
    ids.push(entry.candidateId);
  }
  return ids.length ? ids : null;
}

export class RemoteAIReranker implements RecommendationReranker {
  constructor(private readonly endpoint: string, private readonly timeoutMs = 2500) {}

  async rerank(context: RerankContext, candidates: RerankCandidate[], signal: AbortSignal): Promise<string[]> {
    if (!this.endpoint.startsWith('https://')) throw new Error('Recommendation endpoint is not HTTPS');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    const compact = (track: Track) => ({ id: track.id, title: track.title, artist: track.artist.name, album: track.album ?? '', duration: track.duration });
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({
          current: compact(context.current), session: context.session.slice(-3).map(compact),
          searchQuery: context.searchQuery?.slice(0, 80) ?? '', languages: context.languages.slice(0, 10),
          favoriteArtists: context.favoriteArtists.slice(0, 10).map((artist) => artist.name),
          likedArtists: context.likedArtists.slice(0, 5), skippedArtists: context.skippedArtists.slice(0, 5),
          candidates: candidates.slice(0, 40).map(({ track, score }) => ({ candidateId: track.id, ...compact(track), deterministicScore: score })),
        }),
      });
      if (!response.ok) throw new Error('Recommendation service unavailable');
      const body: unknown = await response.json();
      const ranked = validateRankedIds(body, new Set(candidates.map(({ track }) => track.id)));
      if (!ranked) throw new Error('Invalid recommendation response');
      return ranked;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}
