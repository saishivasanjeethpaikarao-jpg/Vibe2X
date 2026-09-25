import { describe, expect, it, vi } from 'vitest';
import { Track } from '../../../core/types';
import { PlaylistImportEngine } from '../engine';
import { SourcePlaylist } from '../types';

function track(title: string, artist = 'Singer'): Track {
  return { id: `youtube:${title}`, provider: 'youtube', sourceId: title, title,
    artist: { id: artist, name: artist }, album: 'Film', duration: 200, albumImageUrl: '' };
}

function playlist(titles: string[]): SourcePlaylist {
  return { source: 'file', sourcePlaylistId: 'fixture', sourcePlaylistUrl: '', name: 'Fixture',
    description: '', creator: 'You', unavailableCount: 0, duplicateCount: 0,
    tracks: titles.map((title, position) => ({ key: `${position}`, sourceId: title, position,
      title, artists: ['Singer'], album: 'Film', duration: 200 })) };
}

function engine(searchTracks: (query: string, signal: AbortSignal) => Promise<Track[]>, getYouTubeTrack?: (id: string, signal: AbortSignal) => Promise<Track>) {
  const unused = { fetchPlaylist: async () => { throw new Error('not used'); } };
  return new PlaylistImportEngine({ youtube: unused, spotify: unused, searchTracks, getYouTubeTrack });
}

describe('bounded progressive metadata import', () => {
  it('retries the ordinary Search filter when Songs-only results miss a findable track', async () => {
    const found = track('Hidden in All');
    const search = vi.fn(async (_query: string, _signal: AbortSignal, filter?: 'Songs' | 'All') =>
      filter === 'All' ? [found] : []);
    const result = await engine(search).matchMetadata(playlist(['Hidden in All']), new AbortController().signal);
    expect(result[0].selectedTrack?.id).toBe(found.id);
    expect(search).toHaveBeenCalledWith('Hidden in All', expect.anything(), 'All');
  });

  it('uses a known YouTube video ID as metadata identity without searching or resolving a stream', async () => {
    const input = playlist(['Song']);
    input.tracks[0].sourceUrl = 'https://www.youtube.com/watch?v=abcdefghijk&si=share';
    const search = vi.fn(async () => []);
    const metadata = vi.fn(async () => ({ ...track('Song'), sourceId: 'abcdefghijk', id: 'youtube:abcdefghijk' }));
    const result = await engine(search, metadata).matchMetadata(input, new AbortController().signal);
    expect(metadata).toHaveBeenCalledWith('abcdefghijk', expect.anything());
    expect(search).not.toHaveBeenCalled();
    expect(result[0].selectedTrack?.sourceId).toBe('abcdefghijk');
  });

  it('searches progressively, stops at high confidence, and reuses duplicate work', async () => {
    const search = vi.fn(async (query: string) => /naatu/i.test(query) ? [track('Naatu Naatu')] : []);
    const input = playlist(['నాటు నాటు', 'నాటు నాటు']);
    const result = await engine(search).matchMetadata(input, new AbortController().signal);
    expect(result.map((item) => item.confidence)).toEqual(['HIGH', 'HIGH']);
    expect(search).toHaveBeenCalledTimes(2); // native query then romanized query, once per duplicate
    expect(result[0].source.key).toBe('0');
    expect(result[1].source.key).toBe('1');
  });

  it('keeps transient provider errors separate from not found and permits partial save', async () => {
    const search = vi.fn(async (query: string) => {
      if (query.includes('Network')) throw new Error('Network request failed');
      if (query.includes('Found')) return [track('Found')];
      return [];
    });
    const input = playlist(['Found', 'Missing', 'Network']);
    const importer = engine(search);
    const result = await importer.matchMetadata(input, new AbortController().signal);
    expect(result.map((item) => item.failureReason)).toEqual([undefined, 'NO_CANDIDATES', 'NETWORK_TIMEOUT']);
    const prepared = importer.prepareMatched(input, result);
    expect(prepared.tracks.map((item) => item.title)).toEqual(['Found']);
    expect(prepared.notFoundCount).toBe(1);
    expect(prepared.temporaryFailureCount).toBe(1);
    expect(prepared.unavailableCount).toBe(0);
  });

  it.each([10, 100, 520])('matches %i rows with at most four active searches and ordered results', async (count) => {
    const titles = Array.from({ length: count }, (_, index) => `Song ${index}`);
    let active = 0;
    let peak = 0;
    const search = vi.fn(async (query: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return [track(query.replace(/ Singer$/, ''))];
    });
    let metrics: { elapsedMs: number; providerCalls: number } | undefined;
    const result = await engine(search).matchMetadata(playlist(titles), new AbortController().signal,
      undefined, (diagnostics) => { metrics = diagnostics; });
    expect(peak).toBeLessThanOrEqual(4);
    expect(result).toHaveLength(count);
    expect(result[0].source.title).toBe('Song 0');
    expect(result[count - 1].source.title).toBe(`Song ${count - 1}`);
    expect(metrics?.providerCalls).toBe(count);
    expect(metrics?.elapsedMs).toBeGreaterThanOrEqual(0);
  }, 15_000);

  it('cancels before results can be saved', async () => {
    const controller = new AbortController();
    const search = async () => { controller.abort(); return [track('Song')]; };
    await expect(engine(search).matchMetadata(playlist(['Song']), controller.signal)).rejects.toThrow('cancelled');
  });

  it('stops hammering the provider during a broad outage and marks remaining rows as temporary', async () => {
    const search = vi.fn(async () => { throw new Error('Network request failed'); });
    const input = playlist(Array.from({ length: 100 }, (_, index) => `Song ${index}`));
    const results = await engine(search).matchMetadata(input, new AbortController().signal);
    expect(search.mock.calls.length).toBeLessThan(10);
    expect(results).toHaveLength(100);
    expect(results.every((item) => item.failureReason === 'NETWORK_TIMEOUT' || item.failureReason === 'PROVIDER_ERROR')).toBe(true);
  });
});
