import { Track } from './types';

/** Presentation labels are not musical editions. Keep remix/live/acoustic/etc. */
const PRESENTATION = /\b(?:official\s+(?:music\s+)?(?:audio|video)|lyrics?(?:\s+video)?|full\s+video|audio\s+only|visuali[sz]er)\b/gi;

export function normalizedSongText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

/** A conservative identity for duplicate uploads of the same song. */
export function logicalSongKey(track: Track): string {
  const artist = normalizedSongText(track.artist.name);
  let title = track.title.replace(PRESENTATION, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ');
  // Providers sometimes return "Song - Artist" as the title as well as the
  // artist field. Remove only a suffix that agrees with that field.
  const parts = title.split(/\s+[-–—]\s+/);
  if (parts.length > 1 && normalizedSongText(parts[parts.length - 1]) === artist) {
    title = parts.slice(0, -1).join(' - ');
  }
  return `${artist}|${normalizedSongText(title)}`;
}
