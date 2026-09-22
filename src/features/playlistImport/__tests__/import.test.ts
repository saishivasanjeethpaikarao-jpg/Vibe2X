import { describe, expect, it, vi } from 'vitest';
import { Playlist, Track } from '../../../core/types';
import { PlaylistPage } from '../../../providers/TrackResolver';
import { PlaylistImportEngine } from '../engine';
import { ParsedPlaylistUrl, PlaylistSourceClient, SourcePlaylist } from '../types';
import { YouTubePlaylistSource } from '../youtubeSource';
import { collectShelfItems } from '../../../providers/youtube/parse';

const parsed: ParsedPlaylistUrl = {
  source: 'youtube',
  playlistId: 'PL1234567890abcdef',
  canonicalUrl: 'https://www.youtube.com/playlist?list=PL1234567890abcdef',
};

function track(id: string): Track {
  return {
    id: `youtube:${id}`,
    provider: 'youtube',
    sourceId: id,
    title: `Track ${id}`,
    artist: { id: `artist:${id}`, name: `Artist ${id}` },
    albumImageUrl: '',
    duration: 180,
  };
}

function page(tracks: Track[], continuation?: string, unavailableCount = 0): PlaylistPage {
  return {
    playlist: {
      id: 'youtube:playlist:PL1234567890abcdef',
      provider: 'youtube',
      browseId: 'PL1234567890abcdef',
      name: 'Fixture Playlist',
      description: '',
      creator: 'Fixture Owner',
      coverImageUrl: '',
      trackCount: 4,
    },
    tracks,
    continuation,
    unavailableCount,
  };
}

function engine(source: PlaylistSourceClient) {
  return new PlaylistImportEngine({
    youtube: source,
    spotify: source,
    searchTracks: async () => [],
  });
}

describe('playlist import transaction preparation', () => {
  it('imports a one-track playlist', async () => {
    const resolver = { getPlaylist: vi.fn().mockResolvedValue(page([track('one')])) };
    const source = new YouTubePlaylistSource(resolver);
    const fetched = await engine(source).fetch(parsed, new AbortController().signal);
    const prepared = engine(source).prepareYouTube(fetched);
    expect(prepared.tracks.map((item) => item.sourceId)).toEqual(['one']);
  });

  it('loads every page in original order', async () => {
    const resolver = {
      getPlaylist: vi
        .fn()
        .mockResolvedValueOnce(page([track('one'), track('two')], 'next-1'))
        .mockResolvedValueOnce(page([track('three')], 'next-2'))
        .mockResolvedValueOnce(page([track('four')])),
    };
    const fetched = await new YouTubePlaylistSource(resolver).fetchPlaylist(
      parsed,
      new AbortController().signal
    );
    expect(fetched.tracks.map((item) => item.sourceId)).toEqual(['one', 'two', 'three', 'four']);
    expect(resolver.getPlaylist).toHaveBeenCalledTimes(3);
  });

  it('continues past an unavailable first page when a continuation has playable tracks', async () => {
    const resolver = {
      getPlaylist: vi.fn()
        .mockResolvedValueOnce(page([], 'next', 2))
        .mockResolvedValueOnce(page([track('available')])),
    };
    const fetched = await new YouTubePlaylistSource(resolver).fetchPlaylist(parsed, new AbortController().signal);
    expect(fetched.tracks.map((item) => item.sourceId)).toEqual(['available']);
    expect(fetched.unavailableCount).toBe(2);
  });

  it('parses YouTube browse continuation actions', () => {
    const fixture = {
      onResponseReceivedActions: [
        {
          appendContinuationItemsAction: {
            continuationItems: [
              { musicResponsiveListItemRenderer: { playlistItemData: { videoId: 'one' } } },
              { continuationItemRenderer: { continuationEndpoint: {} } },
            ],
          },
        },
      ],
    };
    expect(collectShelfItems(fixture).flatMap((shelf) => shelf.items)).toHaveLength(1);
  });

  it('reports unavailable items without creating broken tracks', async () => {
    const resolver = { getPlaylist: vi.fn().mockResolvedValue(page([track('one')], undefined, 2)) };
    const fetched = await new YouTubePlaylistSource(resolver).fetchPlaylist(
      parsed,
      new AbortController().signal
    );
    expect(fetched.tracks).toHaveLength(1);
    expect(fetched.unavailableCount).toBe(2);
  });

  it('skips duplicate source tracks according to the existing local playlist model', async () => {
    const resolver = {
      getPlaylist: vi
        .fn()
        .mockResolvedValueOnce(page([track('one')], 'next'))
        .mockResolvedValueOnce(page([track('one'), track('two')])),
    };
    const fetched = await new YouTubePlaylistSource(resolver).fetchPlaylist(
      parsed,
      new AbortController().signal
    );
    expect(fetched.tracks.map((item) => item.sourceId)).toEqual(['one', 'two']);
    expect(fetched.duplicateCount).toBe(1);
  });

  it('fails the whole in-memory import when a later page fails', async () => {
    const resolver = {
      getPlaylist: vi
        .fn()
        .mockResolvedValueOnce(page([track('one')], 'next'))
        .mockRejectedValueOnce(new Error('network down')),
    };
    await expect(
      new YouTubePlaylistSource(resolver).fetchPlaylist(parsed, new AbortController().signal)
    ).rejects.toThrow('Nothing was saved');
  });

  it('cancels before calling the source', async () => {
    const source: PlaylistSourceClient = { fetchPlaylist: vi.fn() };
    const controller = new AbortController();
    controller.abort();
    await expect(engine(source).fetch(parsed, controller.signal)).rejects.toThrow('cancelled');
    expect(source.fetchPlaylist).not.toHaveBeenCalled();
  });

  it('detects importing the same source twice and suggests a copy', () => {
    const source: PlaylistSourceClient = { fetchPlaylist: vi.fn() };
    const fetched: SourcePlaylist = {
      source: 'youtube',
      sourcePlaylistId: parsed.playlistId,
      sourcePlaylistUrl: parsed.canonicalUrl,
      name: 'Fixture Playlist',
      description: '',
      creator: 'Fixture Owner',
      tracks: [],
      unavailableCount: 0,
      duplicateCount: 0,
    };
    const existing: Playlist[] = [
      {
        id: 'local:one',
        name: 'Fixture Playlist',
        description: '',
        creator: 'You',
        coverImageUrl: '',
        tracks: [],
        source: { provider: 'youtube', browseId: parsed.playlistId },
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const collision = engine(source).collisionFor(fetched, existing);
    expect(collision.sameSource?.id).toBe('local:one');
    expect(collision.suggestedName).toBe('Fixture Playlist (2)');
  });

  it('handles a playlist-name collision without overwriting', () => {
    const source: PlaylistSourceClient = { fetchPlaylist: vi.fn() };
    const fetched: SourcePlaylist = {
      source: 'spotify',
      sourcePlaylistId: '37i9dQZF1DXcBWIGoYBM5M',
      sourcePlaylistUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      name: 'Road Trip',
      description: '',
      creator: 'Owner',
      tracks: [],
      unavailableCount: 0,
      duplicateCount: 0,
    };
    const existing: Playlist[] = [
      {
        id: 'local:road-trip',
        name: 'Road Trip',
        description: '',
        creator: 'You',
        coverImageUrl: '',
        tracks: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const collision = engine(source).collisionFor(fetched, existing);
    expect(collision.sameSource).toBeNull();
    expect(collision.sameName?.id).toBe('local:road-trip');
    expect(collision.suggestedName).toBe('Road Trip (2)');
  });
});
