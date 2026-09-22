import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../core/lie', () => ({
  getListenHistory: vi.fn().mockResolvedValue([]),
  logPlay: vi.fn().mockResolvedValue(undefined),
  clearListenHistory: vi.fn().mockResolvedValue(undefined),
  batchLogPlays: vi.fn().mockResolvedValue(undefined),
}));

import { Track } from '../../../core/types';
import { LibraryService } from '../../../services/LibraryService';

const playable: Track = {
  id: 'youtube:fixture',
  provider: 'youtube',
  sourceId: 'fixture',
  title: 'Fixture Track',
  artist: { id: 'artist:fixture', name: 'Fixture Artist' },
  albumImageUrl: '',
  duration: 180,
};

describe('import storage collision safety', () => {
  afterEach(() => vi.clearAllTimers());

  it('never overwrites a same-name or repeated-source playlist silently', async () => {
    vi.useFakeTimers();
    await LibraryService.load();
    const source = {
      provider: 'youtube' as const,
      browseId: 'PL1234567890abcdef',
      url: 'https://www.youtube.com/playlist?list=PL1234567890abcdef',
      importedAt: 1,
    };

    const original = LibraryService.createImportedPlaylist('Fixture Import', [playable], source);
    expect(original.tracks).toHaveLength(1);

    expect(() =>
      LibraryService.createImportedPlaylist('Fixture Import', [playable], {
        provider: 'spotify',
        browseId: '37i9dQZF1DXcBWIGoYBM5M',
      })
    ).toThrow('already exists');

    expect(() =>
      LibraryService.createImportedPlaylist('Fixture Copy', [playable], source)
    ).toThrow('already in your library');
    expect(LibraryService.getPlaylists()).toHaveLength(1);

    const copy = LibraryService.createImportedPlaylist(
      'Fixture Copy',
      [playable],
      source,
      {},
      { allowSourceCopy: true }
    );
    expect(copy.id).not.toBe(original.id);
    expect(LibraryService.getPlaylists()).toHaveLength(2);
    vi.useRealTimers();
  });
});
