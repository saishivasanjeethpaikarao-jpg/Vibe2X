import Sanscript from '@indic-transliteration/sanscript';

/** Matching copies only: callers retain the source title and artist unchanged. */
const INDIC_RUNS: { range: RegExp; scheme: string }[] = [
  { range: /[\u0900-\u097f]+/g, scheme: 'devanagari' },
  { range: /[\u0980-\u09ff]+/g, scheme: 'bengali' },
  { range: /[\u0a00-\u0a7f]+/g, scheme: 'gurmukhi' },
  { range: /[\u0b80-\u0bff]+/g, scheme: 'tamil' },
  { range: /[\u0c00-\u0c7f]+/g, scheme: 'telugu' },
  { range: /[\u0c80-\u0cff]+/g, scheme: 'kannada' },
  { range: /[\u0d00-\u0d7f]+/g, scheme: 'malayalam' },
];

const DECORATION = /\b(?:official\s+(?:music\s+)?(?:audio|video)|audio\s+only|lyric(?:s)?\s+video|visuali[sz]er|audio\s+song|video\s+song|full\s+video|4k|hd)\b/gi;
const SOUNDTRACK = /\s*[([{]\s*(?:from\s+["“']?.+?["”']?|original\s+motion\s+picture\s+soundtrack|ost)\s*[)\]}]/gi;
const FEATURE_SUFFIX = /[\s([{\-]+(?:featuring|feat\.?|ft\.?)\s+[^\])}]+[\])}]?\s*$/i;
const variantCache = new Map<string, string[]>();
const MAX_VARIANT_CACHE = 4096;

export function transliterateIndic(value: string): string | null {
  let output = value;
  let changed = false;
  for (const { range, scheme } of INDIC_RUNS) {
    output = output.replace(range, (run) => {
      changed = true;
      return Sanscript.t(run, scheme, 'itrans', {
        preferred_alternates: { itrans: { A: 'aa', I: 'ii', U: 'uu' } },
      });
    });
  }
  return changed ? output : null;
}

export function normalizeMetadata(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:featuring|feat\.?|ft\.?)\b/gi, ' feat ')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Loose phonetic copy is only one score signal, never a standalone identity. */
export function phoneticCopy(value: string): string {
  return normalizeMetadata(value)
    .replace(/aa/g, 'a').replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u')
    .replace(/([bcdfghjklmnpqrstvwxyz])\1/g, '$1')
    .split(' ').map((word) => word.length > 3 && word.endsWith('a') ? word.slice(0, -1) : word)
    .join(' ');
}

export function matchingVariants(value: string, title = false): string[] {
  const cacheKey = `${title ? 'title' : 'other'}:${value}`;
  const cached = variantCache.get(cacheKey);
  if (cached) return cached;
  const variants = new Set<string>();
  const add = (text: string) => {
    const normalized = normalizeMetadata(text);
    if (normalized) variants.add(normalized);
    const romanized = transliterateIndic(text);
    if (romanized) {
      variants.add(normalizeMetadata(romanized));
      variants.add(phoneticCopy(romanized));
    } else if (!INDIC_RUNS.some(({ range }) => { range.lastIndex = 0; return range.test(text); })) {
      variants.add(phoneticCopy(text));
    }
  };
  add(value);
  if (title) {
    const clean = value.replace(DECORATION, ' ').replace(/[-–—\s]+$/, '');
    add(clean);
    add(clean.replace(FEATURE_SUFFIX, ' '));
    add(clean.replace(SOUNDTRACK, ' '));
  }
  const result = [...variants].filter(Boolean);
  if (variantCache.size >= MAX_VARIANT_CACHE) variantCache.clear();
  variantCache.set(cacheKey, result);
  return result;
}

export function searchTitleCopy(title: string): string {
  return title.replace(DECORATION, ' ').replace(SOUNDTRACK, ' ')
    .replace(/[-–—\s]+$/, '').replace(FEATURE_SUFFIX, ' ').trim();
}

/** Ordered from specific to broad; the engine stops after a confident hit. */
export function searchQueries(title: string, artists: string[], album?: string, alternate?: { title: string; artists: string[] }): string[] {
  const primary = artists[0] ?? '';
  const cleanTitle = searchTitleCopy(title) || title;
  const romanTitle = transliterateIndic(cleanTitle);
  const romanArtist = transliterateIndic(primary) ?? primary;
  const queries = [
    `${title} ${primary}`,
    `${cleanTitle} ${primary}`,
    romanTitle ? `${romanTitle} ${romanArtist}` : '',
    romanTitle ? `${phoneticCopy(romanTitle)} ${phoneticCopy(romanArtist)}` : '',
    album ? `${cleanTitle} ${album}` : '',
    cleanTitle,
    romanTitle ?? '',
  ];
  if (alternate) queries.push(`${alternate.title} ${alternate.artists[0] ?? ''}`);
  const seen = new Set<string>();
  return queries.map((query) => query.trim().replace(/\s+/g, ' ')).filter((query) => {
    const key = normalizeMetadata(query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
