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

    const matches: SpotifyTrackMatch[] = [];
    const cache = new Map<string, Omit<SpotifyTrackMatch, 'source'>>();

    for (let index = 0; index < playlist.tracks.length; index++) {
      if (signal.aborted) throw cancelled();
      const source = playlist.tracks[index];
      const cached = cache.get(source.sourceId);
      if (cached) {
        matches.push({ source, ...cached });
      } else {
        const query = `${source.title} ${source.artists.join(' ')}`.trim();
        let candidates: Track[] = [];
        try {
          candidates = await this.dependencies.searchTracks(query, signal);
        } catch (error) {
          if (signal.aborted) throw cancelled();
          console.warn('[playlist-import] Match search failed', {
            sourceId: source.sourceId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw appErrorWithMessage(
            'provider_failed',
            `Matching stopped at “${source.title}” because search is unavailable. Nothing was saved.`
          );
        }
        const match = matchSpotifyTrack(source, candidates);
        const reusable = {
          confidence: match.confidence,
          alternatives: match.alternatives,
          selectedTrack: match.selectedTrack,
          reviewed: match.reviewed,
        };
        cache.set(source.sourceId, reusable);
        matches.push(match);
      }
      onProgress?.({ phase: 'matching', completed: index + 1, total: playlist.tracks.length });
      // Yield between large batches so progress/cancel interactions can render.
      if ((index + 1) % 5 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    return matches;
  }

  collisionFor(playlist: SourcePlaylist, existing: Playlist[]): ImportCollision {
    const normalizedName = playlist.name.trim().toLocaleLowerCase();
    const sameSource =
      existing.find(
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
