import { describe, expect, it } from 'vitest';
import { Track } from '../../../core/types';
import { matchSpotifyTrack } from '../matching';
import { matchingVariants, searchQueries, transliterateIndic } from '../normalization';
import { SourceTrack } from '../types';

function source(title: string, artist = 'Test Singer', album = 'Film'): SourceTrack {
  return { key: title, sourceId: title, position: 0, title, artists: [artist], album, duration: 210 };
}

function candidate(title: string, artist = 'Test Singer', album = 'Film'): Track {
  return { id: `youtube:${title}:${artist}`, provider: 'youtube', sourceId: title, title,
    artist: { id: artist, name: artist }, album, duration: 210, albumImageUrl: '' };
}

describe('multilingual import metadata matching', () => {
  it.each([
    ['నాటు నాటు', 'Naatu Naatu'],
    ['तुम ही हो', 'Tum Hi Ho'],
    ['நிலா', 'Nila'],
    ['ನಾಟು ನಾಟು', 'Naatu Naatu'],
    ['മലരേ', 'Malare'],
    ['তুমি', 'Tumi'],
    ['ਦਿਲ', 'Dil'],
  ])('compares %s with %s without changing the original', (original, romanized) => {
    const imported = source(original);
    const result = matchSpotifyTrack(imported, [candidate(romanized)]);
    expect(result.confidence).toBe('HIGH');
    expect(result.selectedTrack?.title).toBe(romanized);
    expect(imported.title).toBe(original);
    expect(transliterateIndic(original)).not.toBeNull();
  });

  it('keeps useful film context while allowing a shorter matching copy', () => {
    const imported = source('Naatu Naatu (From "RRR")', 'Rahul Sipligunj', 'RRR');
    const result = matchSpotifyTrack(imported, [candidate('Naatu Naatu', 'Rahul Sipligunj', 'RRR')]);
    expect(result.confidence).toBe('HIGH');
    expect(imported.title).toContain('From');
  });

  it('handles provider decoration, punctuation and featuring variants', () => {
    const result = matchSpotifyTrack(source('Stay (feat. Alessia Cara) - Official Audio', 'Zedd'), [candidate('Stay ft Alessia Cara', 'Zedd')]);
    expect(result.confidence).toBe('HIGH');
  });

  it('does not auto-accept the wrong edition or wrong artist', () => {
    expect(matchSpotifyTrack(source('Song Name', 'Artist A'), [candidate('Song Name (Live)', 'Artist A')]).confidence).not.toBe('HIGH');
    expect(matchSpotifyTrack(source('Song Name', 'Artist A'), [candidate('Song Name (Remix)', 'Artist A')]).confidence).not.toBe('HIGH');
    expect(matchSpotifyTrack(source('Song Name', 'Artist A'), [candidate('Song Name', 'Artist B')]).confidence).toBe('NO_MATCH');
  });

  it('provides original, normalized, romanized and broad queries without repeats', () => {
    const queries = searchQueries('నాటు నాటు (Official Video)', ['Test Singer'], 'RRR');
    expect(queries[0]).toContain('నాటు నాటు');
    expect(queries.some((query) => /naatu|natu/i.test(query))).toBe(true);
    expect(new Set(queries.map((query) => query.toLowerCase())).size).toBe(queries.length);
    expect(matchingVariants('நிலா')).toContain('nilaa');
  });
});
