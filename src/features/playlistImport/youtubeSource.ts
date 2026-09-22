import { AppError, appErrorWithMessage } from '../../core/errors';
import { Track } from '../../core/types';
import { PlaylistPage } from '../../providers/TrackResolver';
import {
  ImportProgress,
  ParsedPlaylistUrl,
  PlaylistSourceClient,
  SourcePlaylist,
} from './types';

const MAX_PAGES = 2_000;

type YouTubePlaylistReader = {
  getPlaylist(
    browseId: string,
    options?: { continuation?: string; signal?: AbortSignal }
  ): Promise<PlaylistPage>;
};

function cancelled(): never {
  throw appErrorWithMessage('import_cancelled', 'Import cancelled. Nothing was saved.');
}

export class YouTubePlaylistSource implements PlaylistSourceClient {
  constructor(private resolver: YouTubePlaylistReader) {}

  async fetchPlaylist(
    parsed: ParsedPlaylistUrl,
    signal: AbortSignal,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SourcePlaylist> {
    if (signal.aborted) cancelled();

    let first: PlaylistPage;
    try {
      first = await this.resolver.getPlaylist(parsed.playlistId, { signal });
    } catch (error) {
      if (signal.aborted) cancelled();
      if (error instanceof AppError && error.kind === 'invalid_playlist') {
        throw appErrorWithMessage(
          'invalid_playlist',
          'This link was recognized, but YouTube did not expose a public playlist. Check that it is available in YouTube Music.'
        );
      }
      throw error;
    }
    const metadata = first.playlist;
    const tracks: Track[] = [];
    let unavailableCount = 0;
    let page = first;
    let pageCount = 0;
    const seenContinuations = new Set<string>();

    while (true) {
      if (signal.aborted) cancelled();
      tracks.push(...page.tracks);
      unavailableCount += page.unavailableCount ?? 0;
      onProgress?.({
        phase: 'fetching',
        loaded: tracks.length,
      });

      const continuation = page.continuation;
      if (!continuation) break;
      if (seenContinuations.has(continuation) || pageCount >= MAX_PAGES) {
        throw appErrorWithMessage(
          'provider_failed',
          'YouTube returned an invalid pagination sequence. Nothing was saved.'
        );
      }
      seenContinuations.add(continuation);
      pageCount++;

      try {
        page = await this.resolver.getPlaylist(parsed.playlistId, {
          continuation,
          signal,
        });
      } catch (error) {
        if (signal.aborted) cancelled();
        console.warn('[playlist-import] YouTube pagination failed', {
          playlistId: parsed.playlistId,
          page: pageCount + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        throw appErrorWithMessage(
          'provider_failed',
          'YouTube stopped responding before the full playlist loaded. Nothing was saved.'
        );
      }
    }

    if (!tracks.length) {
      throw appErrorWithMessage(
        'invalid_playlist',
        'This YouTube playlist has no available tracks to import.'
      );
    }

    // Existing Vibe2X playlists identify entries by Track.id and intentionally
    // reject duplicates when tracks are added. Apply that same rule on import.
    const seenTrackIds = new Set<string>();
    const uniqueTracks: Track[] = [];
    let duplicateCount = 0;
    for (const track of tracks) {
      if (seenTrackIds.has(track.id)) {
        duplicateCount++;
        continue;
      }
      seenTrackIds.add(track.id);
      uniqueTracks.push(track);
    }

    return {
      source: 'youtube',
      sourcePlaylistId: parsed.playlistId,
      sourcePlaylistUrl: parsed.canonicalUrl,
      name: metadata.name,
      description: metadata.description,
      creator: metadata.creator,
      tracks: uniqueTracks.map((track, position) => ({
        key: `youtube:${track.sourceId}:${position}`,
        sourceId: track.sourceId,
        position,
        title: track.title,
        artists: [track.artist.name],
        album: track.album,
        duration: track.duration,
        sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(track.sourceId)}`,
        playableTrack: track,
      })),
      unavailableCount,
      duplicateCount,
      declaredTrackCount: tracks.length + unavailableCount,
    };
  }
}
