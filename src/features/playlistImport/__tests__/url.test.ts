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

  it('parses YouTube watch URL containing list parameter', () => {
    expect(
      parsePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdef')
    ).toMatchObject({
      source: 'youtube',
      playlistId: 'PL1234567890abcdef',
    });
  });

  it('parses youtu.be short URL with list parameter', () => {
    expect(
      parsePlaylistUrl('https://youtu.be/dQw4w9WgXcQ?list=PL1234567890abcdef')
    ).toMatchObject({
      source: 'youtube',
      playlistId: 'PL1234567890abcdef',
    });
  });

  it('parses YouTube Music playlist with si parameter', () => {
    expect(
      parsePlaylistUrl('https://music.youtube.com/playlist?list=PL1234567890abcdef&si=abc123')
    ).toMatchObject({
      source: 'youtube',
      playlistId: 'PL1234567890abcdef',
    });
  });

  it('accepts extra parameters: si, feature, index, start_radio', () => {
    expect(
      parsePlaylistUrl(
        'https://www.youtube.com/playlist?list=PL1234567890abcdef&si=xyz&feature=share&index=3&start_radio=1'
      )
    ).toMatchObject({
      source: 'youtube',
      playlistId: 'PL1234567890abcdef',
    });
  });

  it('parses YouTube watch URL with list and si from Android share', () => {
    expect(
      parsePlaylistUrl(
        'https://youtube.com/watch?v=abc123DEF_G&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf&si=somerandomstring'
      )
    ).toMatchObject({
      source: 'youtube',
      playlistId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
    });
  });

  it('rejects completely malformed URL', () => {
    expect(parsePlaylistUrl('not a url at all')).toBeNull();
  });

  it('rejects URL with empty list parameter', () => {
    expect(parsePlaylistUrl('https://youtube.com/playlist?list=')).toBeNull();
  });

  it('accepts youtu.be with additional query params', () => {
    expect(
      parsePlaylistUrl(
        'https://youtu.be/dQw4w9WgXcQ?si=abc&list=PL1234567890abcdef&feature=share'
      )
    ).toMatchObject({
      source: 'youtube',
      playlistId: 'PL1234567890abcdef',
    });
  });

  it('reads Android URL query semantics when searchParams is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(URL.prototype, 'searchParams');
    Object.defineProperty(URL.prototype, 'searchParams', { configurable: true, value: undefined });
    try {
      expect(
        parsePlaylistUrl('https://music.youtube.com/playlist?feature=share&list=PL1234567890abcdef&si=abc')?.playlistId
      ).toBe('PL1234567890abcdef');
    } finally {
      if (descriptor) Object.defineProperty(URL.prototype, 'searchParams', descriptor);
    }
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
