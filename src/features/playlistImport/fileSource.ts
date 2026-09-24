import { AppError, appErrorWithMessage } from '../../core/errors';
import { SourcePlaylist, SourceTrack } from './types';

const MAX_FILE_CHARS = 5_000_000;
const MAX_ROWS = 10_000;
const TITLE_HEADERS = new Set(['trackname', 'tracktitle', 'songname', 'songtitle', 'title', 'track', 'song', 'name']);
const ARTIST_HEADERS = new Set(['artistname', 'artistnames', 'artists', 'artist', 'performer', 'creator', 'singer']);
const ALBUM_HEADERS = new Set(['album', 'albumname', 'albumtitle', 'release']);
const URL_HEADERS = new Set(['url', 'uri', 'link', 'trackurl', 'spotifyurl', 'youtubeurl']);
const ISRC_HEADERS = new Set(['isrc', 'trackisrc']);
const PLAYLIST_HEADERS = new Set(['playlistname', 'playlist']);
const DURATION_HEADERS = new Set(['duration', 'durationms', 'durationseconds', 'length']);

export type ColumnMapping = { titleIndex: number; artistIndex: number | null; hasHeader: boolean };
export type FileParseOptions = { mimeType?: string; mapping?: ColumnMapping };

/** Kept in memory only while the user chooses columns; never logged or persisted. */
export class PlaylistColumnMappingRequired extends AppError {
  constructor(readonly fileName: string, readonly contents: string, readonly mimeType: string | undefined,
    readonly columns: string[], readonly sample: string[]) {
    super('invalid_playlist', "We couldn't identify the song-title column. Choose the columns in this file.");
  }
}

function invalid(message: string): never { throw appErrorWithMessage('invalid_playlist', message); }
function headerKey(value: string): string { return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }
function headerIndex(header: string[], aliases: Set<string>): number {
  return header.findIndex((value) => aliases.has(headerKey(value)));
}

/** RFC 4180 quotes, escaped quotes and embedded line breaks. */
function parseDelimited(input: string, delimiter: string, strict = true): string[][] {
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
  if (quoted && strict) invalid('This file contains an unfinished quoted value. Export it again and retry.');
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function delimiterFor(text: string): string {
  // Count actual parsed fields, not separators inside quoted song names.
  const sample = text.slice(0, 16_384);
  const ranked = [',', ';', '\t'].map((delimiter) => {
    const rows = parseDelimited(sample, delimiter, false).filter((row) => row.some(Boolean)).slice(0, 8);
    const width = rows[0]?.length ?? 0;
    const consistent = rows.filter((row) => row.length === width).length;
    const recognized = rows[0] ? headerIndex(rows[0], TITLE_HEADERS) >= 0 : false;
    return { delimiter, score: width > 1 ? consistent * 2 + (recognized ? 20 : 0) + Math.min(width, 6) : 0 };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].delimiter;
}

export function detectPlaylistFileType(fileName: string, mimeType: string | undefined, contents: string): 'csv' | 'txt' {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1].toLowerCase();
  if (extension === 'csv' || extension === 'tsv') return 'csv';
  if (extension === 'txt') {
    const first = parseDelimited(contents.slice(0, 16_384), '\t', false)[0] ?? [];
    return first.length > 1 && headerIndex(first, TITLE_HEADERS) >= 0 ? 'csv' : 'txt';
  }
  if (extension && extension !== 'bin' && extension !== 'text') invalid('Choose a CSV or TXT playlist export.');
  if (/csv|tab-separated|tsv/i.test(mimeType ?? '')) return 'csv';
  const rows = parseDelimited(contents.slice(0, 16_384), delimiterFor(contents));
  if (rows.slice(0, 3).some((row) => row.length > 1)) return 'csv';
  if (/^text\//i.test(mimeType ?? '') || contents.trim()) return 'txt';
  invalid('This playlist file is empty.');
}

function splitTxtLine(value: string): { title: string; artist: string; alternate?: SourceTrack['alternate'] } {
  const parts = value.split(/\s+[-–—]\s+/);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return { title: value.trim(), artist: '' };
  const title = parts[0].trim();
  const artist = parts[1].trim();
  return { title, artist, alternate: { title: artist, artists: [title] } };
}

function parseDuration(value: string, header: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return headerKey(header) === 'durationms' ? Math.round(numeric / 1000) : Math.round(numeric);
  const parts = value.split(':').map(Number);
  return parts.length >= 2 && parts.length <= 3 && parts.every(Number.isFinite)
    ? parts.reduce((total, part) => total * 60 + part, 0) : 0;
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

function makeTrack(title: string, artist: string, album: string, duration: number, position: number, sourceUrl?: string, isrc?: string): SourceTrack {
  return {
    key: `file-row:${position}`, sourceId: stableSourceId(title, artist, album), position, title: title.trim(),
    artists: artist.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean),
    album: album.trim() || undefined, duration, sourceUrl: sourceUrl || undefined, isrc: isrc?.trim() || undefined,
  };
}

/** Parse metadata only. File URLs and third-party IDs never become playback sources. */
export function parsePlaylistFile(fileName: string, contents: string, options: FileParseOptions = {}): SourcePlaylist {
  if (contents.length > MAX_FILE_CHARS) invalid('This playlist file is too large. Use an export smaller than 5 MB.');
  const text = contents.replace(/^\uFEFF/, '');
  const type = detectPlaylistFileType(fileName, options.mimeType, text);
  const name = fileName.replace(/\.(csv|txt|tsv)$/i, '').trim() || 'Imported Playlist';
  const tracks: SourceTrack[] = [];
  let unavailableCount = 0;
  let playlistName = '';

  if (type === 'csv') {
    const rows = parseDelimited(text, delimiterFor(text)).filter((row) => row.some(Boolean));
    if (!rows.length) invalid('This playlist file is empty.');
    const first = rows[0];
    const recognizedTitle = headerIndex(first, TITLE_HEADERS);
    if (recognizedTitle < 0 && first.length > 1 && !options.mapping) {
      throw new PlaylistColumnMappingRequired(fileName, contents, options.mimeType,
        first.map((value, index) => value || `Column ${index + 1}`), rows[1] ?? first);
    }
    const mapping = options.mapping;
    const hasHeader = mapping?.hasHeader ?? recognizedTitle >= 0;
    const header = hasHeader ? rows.shift()! : [];
    const titleIndex = mapping?.titleIndex ?? (recognizedTitle >= 0 ? recognizedTitle : 0);
    const artistIndex = mapping ? mapping.artistIndex ?? -1 : headerIndex(header, ARTIST_HEADERS);
    const albumIndex = hasHeader ? headerIndex(header, ALBUM_HEADERS) : -1;
    const playlistIndex = hasHeader ? headerIndex(header, PLAYLIST_HEADERS) : -1;
    const durationIndex = hasHeader ? headerIndex(header, DURATION_HEADERS) : -1;
    const urlIndex = hasHeader ? headerIndex(header, URL_HEADERS) : -1;
    const isrcIndex = hasHeader ? headerIndex(header, ISRC_HEADERS) : -1;
    if (titleIndex < 0 || titleIndex >= first.length || artistIndex >= first.length || artistIndex === titleIndex)
      invalid('Choose different song-title and artist columns.');

    for (const row of rows) {
      const title = row[titleIndex]?.trim() ?? '';
      if (!title) { unavailableCount++; continue; }
      const artist = artistIndex >= 0 ? row[artistIndex]?.trim() ?? '' : '';
      const rowPlaylist = playlistIndex >= 0 ? row[playlistIndex]?.trim() ?? '' : '';
      if (rowPlaylist) {
        if (playlistName && playlistName !== rowPlaylist) invalid('This file contains multiple playlists. Export one playlist at a time.');
        playlistName = rowPlaylist;
      }
      const duration = durationIndex >= 0 ? parseDuration(row[durationIndex] ?? '', header[durationIndex]) : 0;
      tracks.push(makeTrack(title, artist, albumIndex >= 0 ? row[albumIndex] ?? '' : '', duration, tracks.length,
        urlIndex >= 0 ? row[urlIndex] : undefined, isrcIndex >= 0 ? row[isrcIndex] : undefined));
    }
  } else {
    const lines = text.split(/\r\n|\r|\n/);
    if (lines.length > MAX_ROWS) invalid('This file has too many rows. Import a playlist of 10,000 tracks or fewer.');
    for (const line of lines) {
      const value = line.trim();
      if (!value) continue;
      const parsed = splitTxtLine(value);
      const entry = makeTrack(parsed.title, parsed.artist, '', 0, tracks.length);
      entry.alternate = parsed.alternate;
      tracks.push(entry);
    }
  }

  if (!tracks.length) invalid('No readable songs were found in this file.');
  return {
    source: 'file', sourcePlaylistId: name, sourcePlaylistUrl: '', name: playlistName || name,
    description: 'Imported from a playlist file.', creator: 'You', tracks, unavailableCount,
    duplicateCount: 0, declaredTrackCount: tracks.length + unavailableCount,
  };
}
