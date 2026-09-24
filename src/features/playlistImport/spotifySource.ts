import { appErrorWithMessage } from '../../core/errors';
import {
  ImportProgress,
  ParsedPlaylistUrl,
  PlaylistSourceClient,
  SourcePlaylist,
  SourceTrack,
} from './types';
import { SpotifyAuthService } from './spotifyAuth';

const API = 'https://api.spotify.com/v1';
const PAGE_SIZE = 50;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15_000;

type SpotifyImage = { url?: string };
type SpotifyArtist = { name?: string };
type SpotifyTrack = {
  id?: string | null;
  name?: string;
  type?: string;
  is_local?: boolean;
  duration_ms?: number;
  external_urls?: { spotify?: string };
  external_ids?: { isrc?: string };
  artists?: SpotifyArtist[];
  album?: { name?: string; images?: SpotifyImage[] };
};
type SpotifyPlaylistItem = { item?: SpotifyTrack | null; track?: SpotifyTrack | null };
type SpotifyPage = {
  items?: SpotifyPlaylistItem[];
  next?: string | null;
  total?: number;
  offset?: number;
  limit?: number;
};
type SpotifyPlaylist = {
  id?: string;
  name?: string;
  description?: string | null;
  owner?: { display_name?: string | null };
  external_urls?: { spotify?: string };
  images?: SpotifyImage[];
  items?: { total?: number };
  tracks?: { total?: number };
};

const abortError = () =>
  appErrorWithMessage('import_cancelled', 'Import cancelled. Nothing was saved.');

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true }
    );
  });
}

async function responseReason(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { reason?: string; error?: { message?: string } };
    return body.reason ?? body.error?.message;
  } catch {
    return undefined;
  }
}

export type SpotifyApiPort = {
  get<T>(url: string, signal: AbortSignal): Promise<T>;
};

type SpotifyTokenProvider = {
  getAccessToken(forceRefresh?: boolean): Promise<string>;
};

export class SpotifyApi implements SpotifyApiPort {
  constructor(
    private auth: SpotifyTokenProvider = SpotifyAuthService,
    private fetcher: typeof fetch = fetch
  ) {}

  async get<T>(url: string, signal: AbortSignal): Promise<T> {
    let refreshed = false;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw abortError();
      const token = await this.auth.getAccessToken(refreshed);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        const response = await this.fetcher(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (response.status === 401 && !refreshed) {
          refreshed = true;
          continue;
        }
        if (response.status === 401) {
          throw appErrorWithMessage(
            'authorization_required',
            'Spotify authorization expired. Reconnect Spotify and try again.'
          );
        }
        if (response.status === 403) {
          throw appErrorWithMessage(
            'playlist_forbidden',
            'Spotify only allows importing playlists you own or collaborate on. Check the Spotify account you connected.'
          );
        }
        if (response.status === 404) {
          throw appErrorWithMessage(
            'invalid_playlist',
            'Spotify could not find this playlist, or it is unavailable to your account.'
          );
        }
        if (response.status === 429) {
          const reason = await responseReason(response);
          if (reason === 'QUOTA_EXCEEDED') {
            throw appErrorWithMessage(
              'rate_limited',
              'This Spotify developer account has used its current API quota. Try again after the quota resets.'
            );
          }
          if (attempt === MAX_RETRIES) {
            throw appErrorWithMessage(
              'rate_limited',
              'Spotify is rate limiting imports. Try again later.'
            );
          }
          const retryAfter = Math.max(1, Number(response.headers.get('retry-after')) || 1);
          await delay(retryAfter * 1000, signal);
          continue;
        }
        if (response.status >= 500) {
          if (attempt === MAX_RETRIES) {
            throw appErrorWithMessage(
              'provider_failed',
              'Spotify is unavailable right now. Nothing was saved.'
            );
          }
          await delay(400 * 2 ** attempt, signal);
          continue;
        }
        if (!response.ok) {
          throw appErrorWithMessage(
            'provider_failed',
            'Spotify could not complete this request. Nothing was saved.'
          );
        }
        return (await response.json()) as T;
      } catch (error) {
        if (signal.aborted) throw abortError();
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = appErrorWithMessage('timeout', 'Spotify took too long to respond.');
        } else {
          lastError = error;
        }
        if (
          error instanceof Error &&
          ['AppError'].includes(error.name)
        ) {
          throw error;
        }
        if (attempt === MAX_RETRIES) break;
        await delay(400 * 2 ** attempt, signal);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
    }

    console.warn('[playlist-import] Spotify request failed', {
      endpoint: new URL(url).pathname,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    if (lastError instanceof Error && lastError.name === 'AppError') throw lastError;
    throw appErrorWithMessage('network', 'Could not reach Spotify. Nothing was saved.');
  }
}

export class SpotifyPlaylistSource implements PlaylistSourceClient {
  constructor(private api: SpotifyApiPort = new SpotifyApi()) {}

  async fetchPlaylist(
    parsed: ParsedPlaylistUrl,
    signal: AbortSignal,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SourcePlaylist> {
    const id = encodeURIComponent(parsed.playlistId);
    const metadata = await this.api.get<SpotifyPlaylist>(
      `${API}/playlists/${id}?fields=id,name,description,owner(display_name),external_urls,images,items(total),tracks(total)`,
      signal
    );
    const total = metadata.items?.total ?? metadata.tracks?.total;
    const tracks: SourceTrack[] = [];
    let unavailableCount = 0;
    let offset = 0;
    const seenOffsets = new Set<number>();

    while (total === undefined || offset < total) {
      if (signal.aborted) throw abortError();
      if (seenOffsets.has(offset)) {
        throw appErrorWithMessage(
          'provider_failed',
          'Spotify returned an invalid pagination sequence. Nothing was saved.'
        );
      }
      seenOffsets.add(offset);

      let page: SpotifyPage;
      try {
        page = await this.api.get<SpotifyPage>(
          `${API}/playlists/${id}/items?limit=${PAGE_SIZE}&offset=${offset}`,
          signal
        );
      } catch (error) {
        console.warn('[playlist-import] Spotify pagination failed', {
          playlistId: parsed.playlistId,
          offset,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      const rows = page.items ?? [];
      for (let index = 0; index < rows.length; index++) {
        const source = rows[index].item ?? rows[index].track;
        const position = offset + index;
        if (
          !source?.id ||
          !source.name ||
          source.type && source.type !== 'track' ||
          source.is_local ||
          !source.artists?.some((artist) => artist.name)
        ) {
          unavailableCount++;
          continue;
        }
        tracks.push({
          key: `spotify:${source.id}:${position}`,
          sourceId: source.id,
          position,
          title: source.name,
          artists: source.artists.map((artist) => artist.name).filter((name): name is string => Boolean(name)),
          album: source.album?.name,
          duration: Math.round((source.duration_ms ?? 0) / 1000),
          sourceUrl: source.external_urls?.spotify,
          isrc: source.external_ids?.isrc,
        });
      }

      onProgress?.({ phase: 'fetching', loaded: Math.min(offset + rows.length, total ?? Infinity), total });
      if (!page.next || rows.length === 0) break;
      offset += page.limit || rows.length;
    }

    if (!tracks.length) {
      throw appErrorWithMessage(
        'invalid_playlist',
        'This Spotify playlist has no available music tracks to import.'
      );
    }

    return {
      source: 'spotify',
      sourcePlaylistId: parsed.playlistId,
      sourcePlaylistUrl: metadata.external_urls?.spotify ?? parsed.canonicalUrl,
      name: metadata.name?.trim() || 'Imported Spotify Playlist',
      description: metadata.description ?? '',
      creator: metadata.owner?.display_name?.trim() || 'Spotify',
      tracks,
      unavailableCount,
      duplicateCount: 0,
      declaredTrackCount: total,
    };
  }
}

export const spotifyPlaylistSource = new SpotifyPlaylistSource();
