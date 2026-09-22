import { describe, expect, it } from 'vitest';
import { parsePlaylistUrl, playlistUrlFromDeepLink } from '../url';

const SPOTIFY_ID = '37i9dQZF1DXcBWIGoYBM5M';
const YOUTUBE_ID = 'PL1234567890abcdef';

describe('parsePlaylistUrl', () => {
  it('parses a standard Spotify playlist URL', () => {
    expect(parsePlaylistUrl(`https://open.spotify.com/playlist/${SPOTIFY_ID}`)).toEqual({
      source: 'spotify',
      playlistId: SPOTIFY_ID,
      canonicalUrl: `https://open.spotify.com/playlist/${SPOTIFY_ID}`,
    });
  });

  it('ignores Spotify share query parameters', () => {
    expect(
      parsePlaylistUrl(`https://open.spotify.com/playlist/${SPOTIFY_ID}?si=abc&utm_source=copy-link`)
        ?.playlistId
    ).toBe(SPOTIFY_ID);
  });

  it('rejects malformed Spotify playlist URLs', () => {
    expect(parsePlaylistUrl('https://open.spotify.com/playlist/not-an-id')).toBeNull();
    expect(parsePlaylistUrl(`https://open.spotify.com/track/${SPOTIFY_ID}`)).toBeNull();
  });

  it('parses a standard YouTube playlist URL', () => {
    expect(parsePlaylistUrl(`https://www.youtube.com/playlist?list=${YOUTUBE_ID}`)).toMatchObject({
      source: 'youtube',
      playlistId: YOUTUBE_ID,
    });
  });

  it('parses a YouTube Music playlist URL', () => {
    expect(parsePlaylistUrl(`https://music.youtube.com/playlist?list=${YOUTUBE_ID}`)).toMatchObject({
      source: 'youtube',
      playlistId: YOUTUBE_ID,
    });
  });

  it('rejects malformed YouTube playlist URLs', () => {
    expect(parsePlaylistUrl('https://youtube.com/playlist')).toBeNull();
    expect(parsePlaylistUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('rejects unrelated URLs', () => {
    expect(parsePlaylistUrl(`https://example.com/playlist?list=${YOUTUBE_ID}`)).toBeNull();
  });

  it('extracts a validated playlist URL from a Vibe2X deep link', () => {
    const shared = `https://www.youtube.com/playlist?list=${YOUTUBE_ID}`;
    expect(playlistUrlFromDeepLink(`vibe2x://import?url=${encodeURIComponent(shared)}`)).toBe(shared);
    expect(playlistUrlFromDeepLink('vibe2x://import?url=https%3A%2F%2Fexample.com')).toBeNull();
  });
});
