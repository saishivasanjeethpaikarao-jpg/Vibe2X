import { appErrorWithMessage } from '../../core/errors';
import { SourcePlaylist, SourceTrack } from './types';

const MAX_FILE_CHARS = 5_000_000;
const MAX_ROWS = 10_000;
const TITLE_HEADERS = new Set(['trackname', 'tracktitle', 'songname', 'songtitle', 'title', 'track', 'song']);
const ARTIST_HEADERS = new Set(['artistname', 'artistnames', 'artists', 'artist', 'performer']);
const ALBUM_HEADERS = new Set(['album', 'albumname', 'albumtitle']);
const PLAYLIST_HEADERS = new Set(['playlistname', 'playlist']);
const DURATION_HEADERS = new Set(['duration', 'durationms', 'durationseconds', 'length']);

function invalid(message: string): never {
  throw appErrorWithMessage('invalid_playlist', message);
}

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerIndex(header: string[], aliases: Set<string>): number {
  return header.findIndex((value) => aliases.has(headerKey(value)));
}

function delimiterFor(header: string): string {
  const options = [',', '\t', ';'];
  return options.sort((a, b) => header.split(b).length - header.split(a).length)[0];
}

/** RFC 4180 quoting, escaped quotes and embedded line breaks, without a native dependency. */
function parseDelimited(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index++; }
      else if (!quoted && field.trim()) field += char;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(field.trim()); field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      row.push(field.trim()); field = '';
      rows.push(row); row = [];
      if (char === '\r' && input[index + 1] === '\n') index++;
      if (rows.length > MAX_ROWS + 1) invalid('This file has too many rows. Import a playlist of 10,000 tracks or fewer.');
    } else field += char;
  }
  if (quoted) invalid('This CSV file contains an unfinished quoted value. Export it again and retry.');
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function combinedTrack(value: string): { title: string; artist: string } | null {
  const parts = value.split(/\s+[-–—]\s+/);
  if (parts.length < 2) return null;
  const artist = parts.shift()?.trim() ?? '';
  const title = parts.join(' - ').trim();
  return artist && title ? { title, artist } : null;
}

function parseDuration(value: string, header: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return headerKey(header) === 'durationms' ? Math.round(numeric / 1000) : Math.round(numeric);
  }
  const parts = value.split(':').map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : 0;
}

function stableSourceId(title: string, artist: string, album: string): string {
  const value = [title, artist, album].map((part) => part.trim().normalize('NFKC').toLowerCase()).join('\u001f');
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index++) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second ^ value.charCodeAt(index), 3266489917);
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

function makeTrack(title: string, artist: string, album: string, duration: number, position: number): SourceTrack {
  const artists = artist.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);
  return {
    key: `file-row:${position}`,
    sourceId: stableSourceId(title, artist, album),
    position,
    title: title.trim(),
    artists,
    album: album.trim() || undefined,
    duration,
  };
}

/** Parse only metadata. No imported file bytes or third-party IDs become playback sources. */
export function parsePlaylistFile(fileName: string, contents: string): SourcePlaylist {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1].toLowerCase();
  if (extension !== 'csv' && extension !== 'txt') invalid('Choose a CSV or TXT playlist export.');
  if (contents.length > MAX_FILE_CHARS) invalid('This playlist file is too large. Use an export smaller than 5 MB.');

  const text = contents.replace(/^\uFEFF/, '');
  const name = fileName.replace(/\.(csv|txt)$/i, '').trim() || 'Imported Playlist';
  const tracks: SourceTrack[] = [];
  let unavailableCount = 0;
  let playlistName = '';

  if (extension === 'csv') {
    const delimiter = delimiterFor(text.split(/\r?\n/, 1)[0] ?? '');
    const rows = parseDelimited(text, delimiter);
    const header = rows.shift() ?? [];
    const titleIndex = headerIndex(header, TITLE_HEADERS);
    const artistIndex = headerIndex(header, ARTIST_HEADERS);
    const albumIndex = headerIndex(header, ALBUM_HEADERS);
    const playlistIndex = headerIndex(header, PLAYLIST_HEADERS);
    const durationIndex = headerIndex(header, DURATION_HEADERS);
    if (titleIndex < 0) invalid('This CSV needs a Track name, Song, or Title column.');

    for (const row of rows) {
      if (row.every((value) => !value)) continue;
      let title = row[titleIndex]?.trim() ?? '';
      let artist = artistIndex >= 0 ? row[artistIndex]?.trim() ?? '' : '';
      if (!artist) {
        const combined = combinedTrack(title);
        if (combined) { title = combined.title; artist = combined.artist; }
      }
      if (!title || !artist) { unavailableCount++; continue; }
      const rowPlaylist = playlistIndex >= 0 ? row[playlistIndex]?.trim() ?? '' : '';
      if (rowPlaylist) {
        if (playlistName && playlistName !== rowPlaylist) invalid('This file contains multiple playlists. Export one playlist at a time.');
        playlistName = rowPlaylist;
      }
      const duration = durationIndex >= 0 ? parseDuration(row[durationIndex] ?? '', header[durationIndex]) : 0;
      tracks.push(makeTrack(title, artist, albumIndex >= 0 ? row[albumIndex] ?? '' : '', duration, tracks.length));
    }
  } else {
    const lines = text.split(/\r?\n/);
    if (lines.length > MAX_ROWS) invalid('This file has too many rows. Import a playlist of 10,000 tracks or fewer.');
    for (const line of lines) {
      if (!line.trim()) continue;
      const combined = combinedTrack(line.trim());
      if (!combined) { unavailableCount++; continue; }
      const entry = makeTrack(combined.title, combined.artist, '', 0, tracks.length);
      entry.alternate = { title: combined.artist, artists: [combined.title] };
      tracks.push(entry);
    }
  }

  if (!tracks.length) invalid('No readable songs were found. Use CSV columns for track and artist, or TXT lines in “Artist - Title” format.');
  return {
    source: 'file',
    sourcePlaylistId: name,
    sourcePlaylistUrl: '',
    name: playlistName || name,
    description: 'Imported from a playlist file.',
    creator: 'You',
    tracks,
    unavailableCount,
    duplicateCount: 0,
    declaredTrackCount: tracks.length + unavailableCount,
  };
}
