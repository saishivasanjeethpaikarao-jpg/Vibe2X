import { describe, expect, it } from 'vitest';
import { Track } from '../../../core/types';
import { matchSpotifyTrack } from '../matching';
import { SourceTrack } from '../types';

function source(title: string, artists: string[], duration = 240): SourceTrack {
  return {
    key: `spotify:test:${title}`,
    sourceId: `source-${title}`,
    position: 0,
    title,
    artists,
    album: 'Test Album',
    duration,
  };
}

function candidate(title: string, artist: string, duration = 240, album = 'Test Album'): Track {
  return {
    id: `youtube:${title}:${artist}`,
    provider: 'youtube',
    sourceId: `${title}-${artist}`,
    title,
    artist: { id: `artist:${artist}`, name: artist },
    album,
    albumImageUrl: '',
    duration,
  };
}

describe('Spotify to Vibe2X matching', () => {
  it('auto-selects an exact title and artist', () => {
    const result = matchSpotifyTrack(source('Midnight City', ['M83']), [candidate('Midnight City', 'M83')]);
    expect(result.confidence).toBe('HIGH');
    expect(result.selectedTrack?.title).toBe('Midnight City');
  });

  it('normalizes capitalization differences', () => {
    const result = matchSpotifyTrack(source('MIDNIGHT CITY', ['m83']), [candidate('Midnight City', 'M83')]);
    expect(result.confidence).toBe('HIGH');
  });

  it('normalizes feat. wording without losing artist checks', () => {
    const result = matchSpotifyTrack(
      source('Stay (feat. Alessia Cara)', ['Zedd', 'Alessia Cara']),
      [candidate('Stay ft Alessia Cara', 'Zedd, Alessia Cara')]
    );
    expect(result.confidence).toBe('HIGH');
  });

  it('uses multiple artists', () => {
    const result = matchSpotifyTrack(source('One Kiss', ['Calvin Harris', 'Dua Lipa']), [
      candidate('One Kiss', 'Calvin Harris & Dua Lipa'),
    ]);
    expect(result.confidence).toBe('HIGH');
  });

  it('does not auto-match a remix to the original', () => {
    const result = matchSpotifyTrack(source('Summertime Sadness', ['Lana Del Rey']), [
      candidate('Summertime Sadness (Cedric Gervais Remix)', 'Lana Del Rey'),
    ]);
    expect(result.confidence).not.toBe('HIGH');
  });

  it('does not auto-match a live recording to a studio track', () => {
    const result = matchSpotifyTrack(source('Yellow', ['Coldplay']), [
      candidate('Yellow (Live in London)', 'Coldplay'),
    ]);
    expect(result.confidence).not.toBe('HIGH');
  });

  it('rejects the same title by a different artist', () => {
    const result = matchSpotifyTrack(source('Hello', ['Adele']), [candidate('Hello', 'Lionel Richie')]);
    expect(result.confidence).toBe('NO_MATCH');
  });

  it('returns no match for an unrelated result', () => {
    const result = matchSpotifyTrack(source('Teardrop', ['Massive Attack']), [candidate('Firework', 'Katy Perry')]);
    expect(result.confidence).toBe('NO_MATCH');
    expect(result.selectedTrack).toBeNull();
  });
});
