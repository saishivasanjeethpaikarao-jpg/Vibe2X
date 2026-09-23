import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: class {} }));
import { parsePlaylistFile } from '../fileSource';
import { pickPlaylistFile } from '../filePicker';
import { PlaylistImportEngine } from '../engine';
import { Track } from '../../../core/types';

const track = (id: string, title = id, artist = 'Björk'): Track => ({
  id, title, artist: { id: artist, name: artist }, albumImageUrl: '', duration: 0,
  provider: 'youtube', sourceId: id,
});
const engine = (results: Track[]) => new PlaylistImportEngine({
  youtube: { fetchPlaylist: async () => { throw new Error('unused'); } },
  spotify: { fetchPlaylist: async () => { throw new Error('unused'); } },
  searchTracks: async () => results,
});

describe('playlist file parsing', () => {
  it('reads TuneMyMusic-style CSV metadata and playlist name', () => {
    const playlist = parsePlaylistFile('export.csv', 'Track name,Artist name,Album,Playlist name,Type,ISRC\nJóga,Björk,Homogenic,Night Drive,track,ABC\n');
    expect(playlist.name).toBe('Night Drive');
    expect(playlist.tracks[0]).toMatchObject({ title: 'Jóga', artists: ['Björk'], album: 'Homogenic' });
  });

  it('reads TXT Artist - Title lines', () => {
    const playlist = parsePlaylistFile('Evening.txt', 'Björk - Jóga\r\nRadiohead - Weird Fishes\r\n');
    expect(playlist.name).toBe('Evening');
    expect(playlist.tracks.map((item) => item.title)).toEqual(['Jóga', 'Weird Fishes']);
  });

  it('can match a Title - Artist TXT export without assuming its direction', async () => {
    const playlist = parsePlaylistFile('export.txt', 'Jóga - Björk');
    const matches = await engine([track('joga', 'Jóga')]).matchMetadata(playlist, new AbortController().signal);
    expect(matches[0].confidence).toBe('HIGH');
    expect(matches[0].source).toMatchObject({ title: 'Jóga', artists: ['Björk'] });
  });

  it('preserves quoted commas, Unicode, escaped quotes and multiline values', () => {
    const playlist = parsePlaylistFile('songs.csv', 'Track name,Artist name,Album\n"Hello, World",Björk,"Debut, Deluxe"\n"Say ""Hi""",Zoë,Record\n"Long\nSong",Artist,Record');
    expect(playlist.tracks.map((item) => item.title)).toEqual(['Hello, World', 'Say "Hi"', 'Long\nSong']);
    expect(playlist.tracks[0].album).toBe('Debut, Deluxe');
  });

  it('matches non-Latin Unicode metadata instead of stripping it', async () => {
    const playlist = parsePlaylistFile('日本語.csv', 'Track name,Artist name\n夜に駆ける,YOASOBI');
    const matches = await engine([track('yoru', '夜に駆ける', 'YOASOBI')]).matchMetadata(playlist, new AbortController().signal);
    expect(matches[0].confidence).toBe('HIGH');
  });

  it('matches a CSV combined artist field without splitting an artist name incorrectly', async () => {
    const playlist = parsePlaylistFile('duet.csv', 'Track name,Artist name\nOne Kiss,"Calvin Harris, Dua Lipa"');
    const matches = await engine([track('one-kiss', 'One Kiss', 'Calvin Harris, Dua Lipa')]).matchMetadata(playlist, new AbortController().signal);
    expect(matches[0].confidence).toBe('HIGH');
  });

  it('skips blank and malformed rows and keeps duplicate source entries for review', () => {
    const playlist = parsePlaylistFile('songs.csv', 'Track name,Artist name\n\nJóga,Björk\nNo Artist,\nJóga,Björk\n');
    expect(playlist.tracks).toHaveLength(2);
    expect(playlist.tracks[0].key).not.toBe(playlist.tracks[1].key);
    expect(playlist.tracks[0].sourceId).toBe(playlist.tracks[1].sourceId);
    expect(playlist.unavailableCount).toBe(1);
  });

  it('handles a 500+ track file without dropping order', () => {
    const rows = Array.from({ length: 550 }, (_, index) => `Song ${index},Artist ${index}`);
    const playlist = parsePlaylistFile('large.csv', ['Track name,Artist name', ...rows].join('\n'));
    expect(playlist.tracks).toHaveLength(550);
    expect(playlist.tracks[549].title).toBe('Song 549');
  });

  it('matches a 500+ row file with progress and no hidden page limit', async () => {
    const rows = Array.from({ length: 505 }, (_, index) => `Song ${index},Artist ${index}`);
    const playlist = parsePlaylistFile('large.csv', ['Track name,Artist name', ...rows].join('\n'));
    const progress: number[] = [];
    const matches = await engine([]).matchMetadata(playlist, new AbortController().signal, (event) => {
      if (event.phase === 'matching') progress.push(event.completed);
    });
    expect(matches).toHaveLength(505);
    expect(progress.at(-1)).toBe(505);
  });

  it('rejects unsupported or malformed files', () => {
    expect(() => parsePlaylistFile('playlist.json', '{}')).toThrow();
    expect(() => parsePlaylistFile('playlist.csv', 'Wrong,Columns\na,b')).toThrow();
    expect(() => parsePlaylistFile('playlist.csv', 'Track name,Artist name\n"unfinished,Björk')).toThrow();
  });
});

describe('file matching and picker', () => {
  it('reports no matches and partial matches using the existing confidence engine', async () => {
    const playlist = parsePlaylistFile('songs.csv', 'Track name,Artist name\nJóga,Björk\nUnknown,Artist\n');
    const partial = await engine([track('joga', 'Jóga')]).matchMetadata(playlist, new AbortController().signal);
    expect(partial[0].confidence).toBe('HIGH');
    expect(partial[1].confidence).toBe('NO_MATCH');
    const none = await engine([]).matchMetadata(playlist, new AbortController().signal);
    expect(none.every((match) => match.confidence === 'NO_MATCH')).toBe(true);
    const prepared = engine([track('joga', 'Jóga')]).prepareMatched(playlist, partial);
    expect(prepared.tracks.map((item) => item.id)).toEqual(['joga']);
    expect(prepared.unavailableCount).toBe(1);
  });

  it('counts duplicate matched entries once in the local playlist', async () => {
    const playlist = parsePlaylistFile('songs.csv', 'Track name,Artist name\nJóga,Björk\nJóga,Björk');
    const importer = engine([track('joga', 'Jóga')]);
    const matches = await importer.matchMetadata(playlist, new AbortController().signal);
    const prepared = importer.prepareMatched(playlist, matches);
    expect(prepared.tracks).toHaveLength(1);
    expect(prepared.duplicateCount).toBe(1);
  });

  it('does not read a file when the system picker is cancelled', async () => {
    const read = vi.fn(async () => '');
    const pick = vi.fn(async () => ({ canceled: true as const, assets: null }));
    expect(await pickPlaylistFile(pick, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('cancels matching before a local playlist can be prepared', async () => {
    const playlist = parsePlaylistFile('songs.csv', 'Track name,Artist name\nJóga,Björk\nOther,Artist');
    const controller = new AbortController();
    const importer = new PlaylistImportEngine({
      youtube: { fetchPlaylist: async () => { throw new Error('unused'); } },
      spotify: { fetchPlaylist: async () => { throw new Error('unused'); } },
      searchTracks: async () => { controller.abort(); return [track('joga', 'Jóga')]; },
    });
    await expect(importer.matchMetadata(playlist, controller.signal)).rejects.toThrow('Import cancelled');
  });
});
