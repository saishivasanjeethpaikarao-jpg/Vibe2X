import { Track } from './types';

/** Presentation labels are not musical editions. Keep remix/live/acoustic/etc. */
const PRESENTATION = /\b(?:official\s+(?:music\s+)?(?:audio|video)|lyrics?(?:\s+video)?|full\s+video|audio\s+only|visuali[sz]er|whatsapp\s+status|status\s+video|hd|4k)\b/gi;

export function normalizedSongText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

/** Common Romanized long vowels differ between uploads (Vaari/Vari). This is
 * deliberately limited to runs of the same vowel; edition words remain. */
function normalizedRomanizedTitle(value: string): string {
  return normalizedSongText(value).replace(/([aeiou])\1+/g, '$1');
}

function titleIdentity(track: Track): string {
  const artist = normalizedSongText(track.artist.name);
  let title = track.title.replace(PRESENTATION, ' ').replace(/\(\s*\)|\[\s*\]/g, ' ');
  const parts = title.split(/\s+[-–—]\s+/);
  if (parts.length > 1 && normalizedSongText(parts[parts.length - 1]) === artist) {
    title = parts.slice(0, -1).join(' - ');
  }
  return normalizedRomanizedTitle(title);
}

/** A conservative identity for duplicate uploads of the same song. */
export function logicalSongKey(track: Track): string {
  const artist = normalizedSongText(track.artist.name);
  return `${artist}|${titleIdentity(track)}`;
}

/** An alternate uploader can name the same recording under a different
 * channel. Only merge across artists when album AND duration corroborate it. */
export function sameLogicalRecording(a: Track, b: Track): boolean {
  if (a.id === b.id || logicalSongKey(a) === logicalSongKey(b)) return true;
  const albumA = normalizedSongText(a.album ?? '');
  const albumB = normalizedSongText(b.album ?? '');
  return !!titleIdentity(a) && titleIdentity(a) === titleIdentity(b) &&
    !!albumA && albumA === albumB && a.duration > 0 && b.duration > 0 &&
    Math.abs(a.duration - b.duration) <= 12;
}
