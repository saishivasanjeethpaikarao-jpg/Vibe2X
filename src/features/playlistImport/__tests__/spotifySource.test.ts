import { describe, expect, it, vi } from 'vitest';

vi.mock('../spotifyAuth', () => ({
  SpotifyAuthService: {
    getAccessToken: vi.fn().mockResolvedValue('fixture-token'),
  },
}));

import { SpotifyApi, SpotifyApiPort, SpotifyPlaylistSource } from '../spotifySource';

const parsed = {
  source: 'spotify' as const,
  playlistId: '37i9dQZF1DXcBWIGoYBM5M',
  canonicalUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
};

function item(id: string) {
  return {
    item: {
      id,
      type: 'track',
      name: `Song ${id}`,
      duration_ms: 180_000,
      artists: [{ name: `Artist ${id}` }],
      album: { name: `Album ${id}` },
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    },
  };
}

describe('SpotifyPlaylistSource', () => {
  it('loads every playlist-items page without production requests', async () => {
    const get = vi.fn(async (url: string) => {
      if (!url.includes('/items?')) {
        return {
          id: parsed.playlistId,
          name: 'Fixture Spotify Playlist',
          description: 'Fixture description',
          owner: { display_name: 'Fixture Owner' },
          external_urls: { spotify: parsed.canonicalUrl },
          items: { total: 3 },
        };
      }
      if (url.includes('offset=0')) {
        return { items: [item('one'), item('two')], next: 'next', total: 3, offset: 0, limit: 2 };
      }
      return { items: [item('three')], next: null, total: 3, offset: 2, limit: 2 };
    });
    const source = new SpotifyPlaylistSource({ get } as SpotifyApiPort);
    const result = await source.fetchPlaylist(parsed, new AbortController().signal);

    expect(result.tracks.map((track) => track.sourceId)).toEqual(['one', 'two', 'three']);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('skips unavailable, local, and non-track Spotify items', async () => {
    const get = vi.fn(async (url: string) => {
      if (!url.includes('/items?')) {
        return { name: 'Fixture', owner: {}, items: { total: 4 } };
      }
      return {
        items: [item('one'), { item: null }, { item: { ...item('local').item, is_local: true } }, { item: { ...item('episode').item, type: 'episode' } }],
        next: null,
        total: 4,
        offset: 0,
        limit: 50,
      };
    });
    const result = await new SpotifyPlaylistSource({ get } as SpotifyApiPort).fetchPlaylist(
      parsed,
      new AbortController().signal
    );
    expect(result.tracks).toHaveLength(1);
    expect(result.unavailableCount).toBe(3);
  });

  it('propagates a midway page failure so no save plan is produced', async () => {
    const get = vi.fn(async (url: string) => {
      if (!url.includes('/items?')) return { name: 'Fixture', owner: {}, items: { total: 3 } };
      if (url.includes('offset=0')) {
        return { items: [item('one'), item('two')], next: 'next', total: 3, offset: 0, limit: 2 };
      }
      throw new Error('fixture network failure');
    });
    await expect(
      new SpotifyPlaylistSource({ get } as SpotifyApiPort).fetchPlaylist(
        parsed,
        new AbortController().signal
      )
    ).rejects.toThrow('fixture network failure');
  });
});

describe('Spotify API errors', () => {
  it('refreshes once after a 401 and then succeeds', async () => {
    const auth = { getAccessToken: vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new') };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await new SpotifyApi(auth, fetcher).get<{ ok: boolean }>(
      'https://api.spotify.com/v1/playlists/test',
      new AbortController().signal
    );
    expect(result.ok).toBe(true);
    expect(auth.getAccessToken).toHaveBeenNthCalledWith(2, true);
  });

  it('turns a 403 into an owner-or-collaborator explanation', async () => {
    const auth = { getAccessToken: vi.fn().mockResolvedValue('token') };
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    await expect(
      new SpotifyApi(auth, fetcher).get(
        'https://api.spotify.com/v1/playlists/test/items',
        new AbortController().signal
      )
    ).rejects.toThrow('own or collaborate');
  });

  it('reports development quota exhaustion without retrying forever', async () => {
    const auth = { getAccessToken: vi.fn().mockResolvedValue('token') };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reason: 'QUOTA_EXCEEDED' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(
      new SpotifyApi(auth, fetcher).get(
        'https://api.spotify.com/v1/playlists/test/items',
        new AbortController().signal
      )
    ).rejects.toThrow('quota');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
