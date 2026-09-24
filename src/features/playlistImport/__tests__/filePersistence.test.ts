import { describe, expect, it, vi } from 'vitest';
import { Track } from '../../../core/types';

const saved = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => saved.get(key) ?? null,
    setItem: async (key: string, value: string) => { saved.set(key, value); },
    removeItem: async (key: string) => { saved.delete(key); },
  },
}));
vi.mock('../../../core/lie', () => ({
  getListenHistory: async () => [], logPlay: async () => {}, clearListenHistory: async () => {}, batchLogPlays: async () => {},
}));

const track = (id: string): Track => ({
  id: `youtube:${id}`, sourceId: id, provider: 'youtube', title: id,
  artist: { id: 'artist', name: 'Artist' }, albumImageUrl: '', duration: 120,
});

describe('imported playlist persistence', () => {
  it('stores playable tracks in source order and reloads them after a new service instance', async () => {
    saved.clear();
    const { LibraryService } = await import('../../../services/LibraryService');
    const { flushWrites } = await import('../../../core/storage');
    await LibraryService.load();
    const created = LibraryService.createPlaylist('File Import QA', { tracks: [track('first'), track('second')] });
    expect(await flushWrites()).toBe(true);
    expect(saved.get('note:v1:playlists')).toContain(created.id);

    vi.resetModules();
    const { LibraryService: reloaded } = await import('../../../services/LibraryService');
    await reloaded.load();
    expect(reloaded.getPlaylist(created.id)?.tracks.map((item) => item.sourceId)).toEqual(['first', 'second']);
  });
});
