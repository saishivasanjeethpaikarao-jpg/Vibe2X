import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: class {} }));
import { parsePlaylistFile, PlaylistColumnMappingRequired } from '../fileSource';
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
  it.each([
    ['Title,Artist', 'Kesariya,Arijit Singh'],
    ['Track Name,Artist Name', 'Kesariya,Arijit Singh'],
    ['Song,Singer', 'Kesariya,Arijit Singh'],
    ['Name,Artists', 'Kesariya,Arijit Singh'],
    [' Track_Title , Creator ', 'Kesariya,Arijit Singh'],
  ])('recognizes %s and accepts a handmade row', (header, row) => {
    const parsed = parsePlaylistFile('handmade.csv', `${header}\r\n${row}\r\nBeliever,Imagine Dragons`);
    expect(parsed.tracks.map((item) => item.title)).toEqual(['Kesariya', 'Believer']);
    expect(parsed.tracks[0].artists).toEqual(['Arijit Singh']);
  });

  it('accepts title-only CSV and leaves matching for review', async () => {
    const playlist = parsePlaylistFile('titles.csv', 'Title\nJóga\n');
    expect(playlist.tracks[0].artists).toEqual([]);
    const matches = await engine([track('joga', 'Jóga')]).matchMetadata(playlist, new AbortController().signal);
    expect(matches[0].confidence).toBe('MEDIUM');
    expect(matches[0].selectedTrack).toBeNull();
  });

  it('accepts BOM, semicolons, reordered optional fields and unknown fields', () => {
    const playlist = parsePlaylistFile('list.csv', '\uFEFFArtist Name;Release;Song Name;Spotify URL;Extra\r\nBjörk;Debut;Jóga;https://open.spotify.com/track/example;ignored');
    expect(playlist.tracks[0]).toMatchObject({ title: 'Jóga', artists: ['Björk'], album: 'Debut' });
    expect(playlist.tracks[0].sourceUrl).toContain('spotify.com');
  });

  it('accepts tabular CSV and tab-separated TXT exports', () => {
    for (const name of ['list.tsv', 'list.txt']) {
      const playlist = parsePlaylistFile(name, 'Artist\tTrack Title\tDuration ms\nBjörk\tJóga\t180000');
      expect(playlist.tracks[0]).toMatchObject({ title: 'Jóga', artists: ['Björk'], duration: 180 });
    }
  });

  it('offers explicit mapping for headerless and unknown-header two-column files', () => {
    const data = 'Kesariya,Arijit Singh\nBeliever,Imagine Dragons';
    expect(() => parsePlaylistFile('plain.csv', data)).toThrow(PlaylistColumnMappingRequired);
    const mapped = parsePlaylistFile('plain.csv', data, { mapping: { titleIndex: 0, artistIndex: 1, hasHeader: false } });
    expect(mapped.tracks.map((item) => item.title)).toEqual(['Kesariya', 'Believer']);
    const inverse = parsePlaylistFile('plain.csv', data, { mapping: { titleIndex: 1, artistIndex: 0, hasHeader: false } });
    expect(inverse.tracks[0].title).toBe('Arijit Singh');
    const unknown = parsePlaylistFile('columns.csv', 'Song_Label,Musician\nKesariya,Arijit Singh',
      { mapping: { titleIndex: 0, artistIndex: 1, hasHeader: true } });
    expect(unknown.tracks).toHaveLength(1);
  });

  it('reads title-only, title–artist and ambiguous TXT lines without rejecting the file', () => {
    const playlist = parsePlaylistFile('songs.txt', 'Kesariya - Arijit Singh\nBeliever — Imagine Dragons\nOne More Song\n\n');
    expect(playlist.tracks.map((item) => item.title)).toEqual(['Kesariya', 'Believer', 'One More Song']);
    expect(playlist.tracks.map((item) => item.artists)).toEqual([['Arijit Singh'], ['Imagine Dragons'], []]);
  });

  it('uses MIME/content when Android supplies no reliable extension', () => {
    expect(parsePlaylistFile('download', 'Title,Artist\nJóga,Björk', { mimeType: 'text/csv' }).tracks).toHaveLength(1);
    expect(parsePlaylistFile('download', 'Jóga\nBeliever', { mimeType: 'text/plain' }).tracks).toHaveLength(2);
  });

  it('reads TuneMyMusic-style CSV metadata and playlist name', () => {
    const playlist = parsePlaylistFile('export.csv', 'Track name,Artist name,Album,Playlist name,Type,ISRC\nJóga,Björk,Homogenic,Night Drive,track,ABC\n');
    expect(playlist.name).toBe('Night Drive');
    expect(playlist.tracks[0]).toMatchObject({ title: 'Jóga', artists: ['Björk'], album: 'Homogenic' });
  });

  it('reads ambiguous TXT lines without losing either title/artist interpretation', () => {
    const playlist = parsePlaylistFile('Evening.txt', 'Björk - Jóga\r\nRadiohead - Weird Fishes\r\n');
    expect(playlist.name).toBe('Evening');
    expect(playlist.tracks.map((item) => item.alternate?.title)).toEqual(['Jóga', 'Weird Fishes']);
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

  it('keeps title-only rows and duplicate source entries for review', () => {
    const playlist = parsePlaylistFile('songs.csv', 'Track name,Artist name\n\nJóga,Björk\nNo Artist,\nJóga,Björk\n');
    expect(playlist.tracks).toHaveLength(3);
    expect(playlist.tracks[0].key).not.toBe(playlist.tracks[2].key);
    expect(playlist.tracks[0].sourceId).toBe(playlist.tracks[2].sourceId);
    expect(playlist.tracks[1].artists).toEqual([]);
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
    expect(() => parsePlaylistFile('playlist.csv', 'Wrong,Columns\na,b')).toThrow('Choose the columns');
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

  it('reads a copied Android content URI without trusting a missing MIME or extension', async () => {
    const read = vi.fn(async () => 'Title,Artist\nKesariya,Arijit Singh');
    const pick = vi.fn(async () => ({ canceled: false as const, assets: [{
      name: 'download', uri: 'content://provider/document/playlist', mimeType: 'application/octet-stream', size: 34, lastModified: 0,
    }] }));
    const playlist = await pickPlaylistFile(pick, read);
    expect(read).toHaveBeenCalledWith('content://provider/document/playlist');
    expect(playlist?.tracks[0].title).toBe('Kesariya');
  });

  it('skips rows with missing title and rejects an empty file', () => {
    const playlist = parsePlaylistFile('songs.csv', 'Title,Artist\n,Artist\nGood,Artist');
    expect(playlist.tracks.map((item) => item.title)).toEqual(['Good']);
    expect(playlist.unavailableCount).toBe(1);
    expect(() => parsePlaylistFile('empty.txt', ' \n\n')).toThrow('No readable songs');
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
