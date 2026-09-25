import { appErrorWithMessage, toAppError } from '../../core/errors';
import { Playlist, Track } from '../../core/types';
import { matchSpotifyTrack } from './matching';
import { normalizeMetadata, searchQueries } from './normalization';
import {
  ImportDiagnostics,
  ImportCollision,
  ImportProgress,
  ParsedPlaylistUrl,
  PlaylistSourceClient,
  PreparedImport,
  SourcePlaylist,
  SourceTrack,
  SpotifyTrackMatch,
} from './types';
import { parsePlaylistUrl } from './url';

export type EngineDependencies = {
  youtube: PlaylistSourceClient;
  spotify: PlaylistSourceClient;
  searchTracks: (query: string, signal: AbortSignal, filter?: 'Songs' | 'All') => Promise<Track[]>;
  getYouTubeTrack?: (videoId: string, signal: AbortSignal) => Promise<Track>;
};

const MATCH_WORKERS = 4;
const MATCH_QUERY_TIMEOUT_MS = 16_000;

function youtubeId(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const id = host === 'youtu.be' ? parsed.pathname.slice(1).split('/')[0]
      : /(^|\.)youtube\.com$/.test(host) ? parsed.searchParams.get('v') : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

const cancelled = () =>
  appErrorWithMessage('import_cancelled', 'Import cancelled. Nothing was saved.');

export class PlaylistImportEngine {
  constructor(private dependencies: EngineDependencies) {}

  detect(input: string): ParsedPlaylistUrl | null {
    return parsePlaylistUrl(input);
  }

  async fetch(
    parsed: ParsedPlaylistUrl,
    signal: AbortSignal,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SourcePlaylist> {
    if (signal.aborted) throw cancelled();
    const source = parsed.source === 'youtube' ? this.dependencies.youtube : this.dependencies.spotify;
    return source.fetchPlaylist(parsed, signal, onProgress);
  }

  async matchSpotify(
    playlist: SourcePlaylist,
    signal: AbortSignal,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SpotifyTrackMatch[]> {
    if (playlist.source !== 'spotify') return [];

    return this.matchMetadata(playlist, signal, onProgress);
  }

  /** Match metadata from a provider or a local export file through the same review system. */
  async matchMetadata(
    playlist: SourcePlaylist,
    signal: AbortSignal,
    onProgress?: (progress: ImportProgress) => void,
    onDiagnostics?: (diagnostics: ImportDiagnostics) => void
  ): Promise<SpotifyTrackMatch[]> {
    if (signal.aborted) throw cancelled();
    const started = Date.now();
    const matches = new Array<SpotifyTrackMatch>(playlist.tracks.length);
    const sourceCache = new Map<string, Promise<Omit<SpotifyTrackMatch, 'source'>>>();
    const queryCache = new Map<string, Promise<Track[]>>();
    let matched = 0;
    let needsReview = 0;
    let notFound = 0;
    let temporaryFailures = 0;
    let completed = 0;
    let cursor = 0;
    let consecutiveProviderFailures = 0;
    let providerOutage = false;
    const stats = { normalizationMs: 0, rankingMs: 0, providerMs: 0, providerCalls: 0, queryCacheHits: 0, sourceCacheHits: 0 };

    const search = (query: string, filter: 'Songs' | 'All' = 'Songs'): Promise<Track[]> => {
      const key = `${filter}:${normalizeMetadata(query)}`;
      const cached = queryCache.get(key);
      if (cached) { stats.queryCacheHits++; return cached; }
      stats.providerCalls++;
      const work = (async () => {
        const controller = new AbortController();
        let rejectAbort: (reason: unknown) => void = () => undefined;
        const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
        const onAbort = () => { controller.abort(); rejectAbort(cancelled()); };
        signal.addEventListener('abort', onAbort, { once: true });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const began = Date.now();
        try {
          if (signal.aborted) throw cancelled();
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(appErrorWithMessage('timeout', 'Search timed out.'));
            }, MATCH_QUERY_TIMEOUT_MS);
          });
          const tracks = await Promise.race([this.dependencies.searchTracks(query, controller.signal, filter), timeout, aborted]);
          consecutiveProviderFailures = 0;
          return tracks;
        } catch (error) {
          if (signal.aborted) throw cancelled();
          const kind = toAppError(error, 'provider_failed').kind;
          consecutiveProviderFailures++;
          if (kind === 'rate_limited' || consecutiveProviderFailures >= MATCH_WORKERS) providerOutage = true;
          if (controller.signal.aborted) throw appErrorWithMessage('timeout', 'Search timed out.');
          throw error;
        } finally {
          stats.providerMs += Date.now() - began;
          if (timer) clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        }
      })();
      queryCache.set(key, work);
      return work;
    };

    const matchOne = async (source: SourceTrack): Promise<Omit<SpotifyTrackMatch, 'source'>> => {
      if (providerOutage) return { confidence: 'NO_MATCH', alternatives: [], selectedTrack: null, reviewed: true, failureReason: 'PROVIDER_ERROR' };
      const candidates = new Map<string, Track>();
      const directId = youtubeId(source.sourceUrl);
      if (directId && this.dependencies.getYouTubeTrack) {
        stats.providerCalls++;
        const metadataStarted = Date.now();
        try {
          const track = await this.dependencies.getYouTubeTrack(directId, signal);
          consecutiveProviderFailures = 0;
          if (track.provider === 'youtube' && track.sourceId === directId) {
            return { confidence: 'HIGH', alternatives: [{ track, score: 1, confidence: 'HIGH', reasons: ['source ID'] }], selectedTrack: track, reviewed: true };
          }
        } catch (error) {
          if (signal.aborted) throw cancelled();
          const kind = toAppError(error, 'provider_failed').kind;
          if (kind === 'network' || kind === 'timeout' || kind === 'rate_limited') {
            consecutiveProviderFailures++;
            if (kind === 'rate_limited' || consecutiveProviderFailures >= MATCH_WORKERS) providerOutage = true;
          }
          // A stale/unavailable URL is not evidence that title metadata cannot match.
        } finally {
          stats.providerMs += Date.now() - metadataStarted;
        }
      }
      const normalizedAt = Date.now();
      const queries = searchQueries(source.title, source.artists, source.album, source.alternate);
      stats.normalizationMs += Date.now() - normalizedAt;
      const rank = (item: SourceTrack) => {
        const began = Date.now();
        const ranked = matchSpotifyTrack(item, [...candidates.values()]);
        stats.rankingMs += Date.now() - began;
        return ranked;
      };
      let best = rank(source);
      let searchFailure: 'NETWORK_TIMEOUT' | 'PROVIDER_ERROR' | undefined;
      for (const query of queries) {
        if (signal.aborted) throw cancelled();
        if (providerOutage) return best.confidence === 'NO_MATCH' ? { ...best, failureReason: 'PROVIDER_ERROR' } : best;
        try {
          for (const track of await search(query)) candidates.set(track.id, track);
        } catch (error) {
          if (signal.aborted) throw cancelled();
          const appError = toAppError(error, 'provider_failed');
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[playlist-import] MATCH', appError.kind);
          best = rank(source);
          searchFailure = appError.kind === 'timeout' || appError.kind === 'network' ? 'NETWORK_TIMEOUT' : 'PROVIDER_ERROR';
          break;
        }
        best = rank(source);
        if (source.alternate && best.confidence !== 'HIGH') {
          const alternate = rank({ ...source, ...source.alternate });
          if ((alternate.alternatives[0]?.score ?? 0) > (best.alternatives[0]?.score ?? 0) + 0.01) best = alternate;
        }
        if (best.confidence === 'HIGH') break;
      }
      // The ordinary Search screen uses the provider's All filter. Songs-only
      // results can omit uploads that Search can find, so try that same path
      // once before declaring a metadata row unmatched.
      if (best.confidence !== 'HIGH' && !providerOutage) {
        try {
          for (const track of await search(source.title, 'All')) candidates.set(track.id, track);
          best = rank(source);
          if (source.alternate && best.confidence !== 'HIGH') {
            const alternate = rank({ ...source, ...source.alternate });
            if ((alternate.alternatives[0]?.score ?? 0) > (best.alternatives[0]?.score ?? 0) + 0.01) best = alternate;
          }
        } catch (error) {
          if (signal.aborted) throw cancelled();
          const kind = toAppError(error, 'provider_failed').kind;
          if (best.confidence === 'NO_MATCH') {
            return { ...best, failureReason: kind === 'network' || kind === 'timeout' ? 'NETWORK_TIMEOUT' : 'PROVIDER_ERROR' };
          }
        }
      }
      return best.confidence === 'NO_MATCH' && searchFailure && !candidates.size
        ? { ...best, failureReason: searchFailure }
        : best;
    };

    const worker = async () => {
      while (cursor < playlist.tracks.length) {
        if (signal.aborted) throw cancelled();
        const index = cursor++;
        const source = playlist.tracks[index];
        const key = `${source.sourceId}:${normalizeMetadata(source.title)}:${source.sourceUrl ?? ''}`;
        let task = sourceCache.get(key);
        if (task) stats.sourceCacheHits++;
        else { task = matchOne(source); sourceCache.set(key, task); }
        const result = await task;
        matches[index] = { ...result, source };
        if (result.confidence === 'HIGH') matched++;
        else if (result.confidence === 'MEDIUM' || result.confidence === 'LOW') needsReview++;
        else if (result.failureReason === 'NETWORK_TIMEOUT' || result.failureReason === 'PROVIDER_ERROR') temporaryFailures++;
        else notFound++;
        completed++;
        if (completed % 5 === 0 || completed === playlist.tracks.length) {
          onProgress?.({ phase: 'matching', completed, total: playlist.tracks.length, matched, needsReview, notFound, temporaryFailures });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MATCH_WORKERS, playlist.tracks.length) }, () => worker()));
    if (signal.aborted) throw cancelled();
    onDiagnostics?.({ elapsedMs: Date.now() - started, ...stats, matched, needsReview, notFound, temporaryFailures });
    return matches;
  }

  collisionFor(playlist: SourcePlaylist, existing: Playlist[]): ImportCollision {
    const normalizedName = playlist.name.trim().toLocaleLowerCase();
    const sameSource = playlist.source === 'file'
      ? null
      : existing.find(
          (item) =>
            item.source?.provider === playlist.source &&
            item.source?.browseId === playlist.sourcePlaylistId
        ) ?? null;
    const sameName =
      existing.find((item) => item.name.trim().toLocaleLowerCase() === normalizedName) ?? null;

    let suggestedName = playlist.name.trim() || 'Imported Playlist';
    if (sameSource || sameName) {
      let suffix = 2;
      const used = new Set(existing.map((item) => item.name.trim().toLocaleLowerCase()));
      while (used.has(`${suggestedName} (${suffix})`.toLocaleLowerCase())) suffix++;
      suggestedName = `${suggestedName} (${suffix})`;
    }
    return { sameSource, sameName, suggestedName };
  }

  prepareYouTube(playlist: SourcePlaylist): PreparedImport {
    const tracks = playlist.tracks
      .map((item) => item.playableTrack)
      .filter((track): track is Track => Boolean(track));
    return {
      playlist,
      tracks,
      automaticallyMatched: tracks.length,
      reviewedMatches: 0,
      needsReview: 0,
      unavailableCount: playlist.unavailableCount,
      notFoundCount: 0,
      temporaryFailureCount: 0,
      duplicateCount: playlist.duplicateCount,
    };
  }

  prepareSpotify(playlist: SourcePlaylist, matches: SpotifyTrackMatch[]): PreparedImport {
    return this.prepareMatched(playlist, matches);
  }

  prepareMatched(playlist: SourcePlaylist, matches: SpotifyTrackMatch[]): PreparedImport {
    const seen = new Set<string>();
    const tracks: Track[] = [];
    let duplicateCount = playlist.duplicateCount;
    let automaticallyMatched = 0;
    let reviewedMatches = 0;
    let needsReview = 0;

    for (const match of matches) {
      if (!match.reviewed && match.confidence !== 'HIGH') {
        needsReview++;
        continue;
      }
      const track = match.selectedTrack;
      if (!track) continue;
      if (seen.has(track.id)) {
        duplicateCount++;
        continue;
      }
      seen.add(track.id);
      tracks.push(track);
      if (match.confidence === 'HIGH') automaticallyMatched++;
      else reviewedMatches++;
    }

    const notFoundCount = matches.filter((match) => match.confidence === 'NO_MATCH' && match.failureReason !== 'NETWORK_TIMEOUT' && match.failureReason !== 'PROVIDER_ERROR').length;
    const temporaryFailureCount = matches.filter((match) => match.failureReason === 'NETWORK_TIMEOUT' || match.failureReason === 'PROVIDER_ERROR').length;

    return {
      playlist,
      tracks,
      automaticallyMatched,
      reviewedMatches,
      needsReview,
      unavailableCount: playlist.unavailableCount,
      notFoundCount,
      temporaryFailureCount,
      duplicateCount,
    };
  }
}
