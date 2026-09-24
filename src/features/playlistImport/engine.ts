import { appErrorWithMessage } from '../../core/errors';
import { Playlist, Track } from '../../core/types';
import { matchSpotifyTrack } from './matching';
import {
  ImportCollision,
  ImportProgress,
  ParsedPlaylistUrl,
  PlaylistSourceClient,
  PreparedImport,
  SourcePlaylist,
  SpotifyTrackMatch,
} from './types';
import { parsePlaylistUrl } from './url';

export type EngineDependencies = {
  youtube: PlaylistSourceClient;
  spotify: PlaylistSourceClient;
  searchTracks: (query: string, signal: AbortSignal) => Promise<Track[]>;
};

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
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SpotifyTrackMatch[]> {
    const matches: SpotifyTrackMatch[] = [];
    const cache = new Map<string, Omit<SpotifyTrackMatch, 'source'>>();
    let matched = 0;
    let needsReview = 0;
    let unavailable = playlist.unavailableCount;

    for (let index = 0; index < playlist.tracks.length; index++) {
      if (signal.aborted) throw cancelled();
      const source = playlist.tracks[index];
      const cached = cache.get(source.sourceId);
      if (cached) {
        matches.push({ source, ...cached });
      } else {
        let candidates: Track[] = [];
        try {
          const query = `${source.title} ${source.artists.join(' ')}`.trim();
          candidates = await this.dependencies.searchTracks(query, signal);
          let initial = matchSpotifyTrack(source, candidates);
          if (!initial.alternatives.length && source.artists.length) {
            const fallback = await this.dependencies.searchTracks(source.title, signal);
            candidates = [...candidates, ...fallback.filter((track) => !candidates.some((item) => item.id === track.id))];
            initial = matchSpotifyTrack(source, candidates);
          }
          if (!initial.alternatives.length && source.alternate) {
            const fallback = await this.dependencies.searchTracks(
              `${source.alternate.title} ${source.alternate.artists.join(' ')}`, signal
            );
            candidates = [...candidates, ...fallback.filter((track) => !candidates.some((item) => item.id === track.id))];
          }
        } catch (error) {
          if (signal.aborted) throw cancelled();
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[playlist-import] MATCH', error instanceof Error ? error.name : 'unknown');
          throw appErrorWithMessage(
            'provider_failed',
            `Matching stopped at “${source.title}” because search is unavailable. Nothing was saved.`
          );
        }
        let match = matchSpotifyTrack(source, candidates);
        if (source.alternate) {
          const alternate = matchSpotifyTrack(
            { ...source, title: source.alternate.title, artists: source.alternate.artists },
            candidates
          );
          if ((alternate.alternatives[0]?.score ?? 0) > (match.alternatives[0]?.score ?? 0) + 0.01) {
            match = alternate;
          }
        }
        const reusable = {
          confidence: match.confidence,
          alternatives: match.alternatives,
          selectedTrack: match.selectedTrack,
          reviewed: match.reviewed,
        };
        cache.set(source.sourceId, reusable);
        matches.push(match);
      }
      const confidence = matches[matches.length - 1].confidence;
      if (confidence === 'HIGH') matched++;
      else if (confidence === 'NO_MATCH') unavailable++;
      else needsReview++;
      if ((index + 1) % 5 === 0 || index + 1 === playlist.tracks.length) {
        onProgress?.({ phase: 'matching', completed: index + 1, total: playlist.tracks.length, matched, needsReview, unavailable });
      }
      // Yield between large batches so progress/cancel interactions can render.
      if ((index + 1) % 5 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

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

    const unmatchedOrSkipped = matches.filter(
      (match) => match.confidence === 'NO_MATCH' || (match.reviewed && !match.selectedTrack)
    ).length;

    return {
      playlist,
      tracks,
      automaticallyMatched,
      reviewedMatches,
      needsReview,
      unavailableCount: playlist.unavailableCount + unmatchedOrSkipped,
      duplicateCount,
    };
  }
}
