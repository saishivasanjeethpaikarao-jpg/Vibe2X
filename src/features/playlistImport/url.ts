import { ParsedPlaylistUrl } from './types';

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]{10,}$/;

function safeUrl(input: string): URL | null {
  const value = input.trim();
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** React Native's URL implementation can omit searchParams on some Android builds. */
function queryValue(url: URL, key: string): string | null {
  const fromSearchParams = url.searchParams?.get(key);
  if (fromSearchParams !== undefined && fromSearchParams !== null) return fromSearchParams;
  const query = url.search.replace(/^\?/, '');
  for (const pair of query.split('&')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    try {
      const name = decodeURIComponent(pair.slice(0, separator).replace(/\+/g, ' '));
      if (name === key) return decodeURIComponent(pair.slice(separator + 1).replace(/\+/g, ' '));
    } catch {
      return null;
    }
  }
  return null;
}

export function parsePlaylistUrl(input: string): ParsedPlaylistUrl | null {
  const value = input.trim();

  const spotifyUri = /^spotify:playlist:([A-Za-z0-9]{22})$/i.exec(value);
  if (spotifyUri) {
    const playlistId = spotifyUri[1];
    return {
      source: 'spotify',
      playlistId,
      canonicalUrl: `https://open.spotify.com/playlist/${playlistId}`,
    };
  }

  const url = safeUrl(value);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'open.spotify.com') {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] !== 'playlist' || !SPOTIFY_ID.test(segments[1] ?? '')) return null;
    const playlistId = segments[1];
    return {
      source: 'spotify',
      playlistId,
      canonicalUrl: `https://open.spotify.com/playlist/${playlistId}`,
    };
  }

  const youtubeHost =
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be';
  if (!youtubeHost) return null;

  const playlistId = queryValue(url, 'list') ?? '';
  if (!YOUTUBE_LIST_ID.test(playlistId)) return null;

  return {
    source: 'youtube',
    playlistId,
    canonicalUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
  };
}

/** URL used when another app or website opens Vibe2X directly. */
export function playlistUrlFromDeepLink(input: string): string | null {
  const url = safeUrl(input);
  if (!url || url.protocol !== 'vibe2x:' || url.hostname !== 'import') return null;
  const shared = queryValue(url, 'url');
  return shared && parsePlaylistUrl(shared) ? shared : null;
}
