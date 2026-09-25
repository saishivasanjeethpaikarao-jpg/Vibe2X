import { describe, expect, it } from 'vitest';
import { Track } from '../types';
import { logicalSongKey } from '../logicalSong';

const track = (title: string, artist = 'Banjaare'): Track => ({
  id: `youtube:${title}:${artist}`, sourceId: title, provider: 'youtube',
  title, artist: { id: artist, name: artist }, albumImageUrl: '', duration: 190,
});

describe('logical song identity', () => {
  it('deduplicates presentation variants and a matching artist suffix', () => {
    const original = logicalSongKey(track('Bairan'));
    for (const title of ['BAIRAN (LYRICS)', 'Bairan - Banjaare', 'Bairan [Official Audio]', 'Bairan - Full Video']) {
      expect(logicalSongKey(track(title))).toBe(original);
    }
  });

  it('preserves genuine editions and different artists', () => {
    const original = logicalSongKey(track('Bairan'));
    for (const title of ['Bairan Remix', 'Bairan (Acoustic)', 'Bairan Live', 'Bairan Reprise', 'Bairan Tamil Version']) {
      expect(logicalSongKey(track(title))).not.toBe(original);
    }
    expect(logicalSongKey(track('Bairan', 'Another Artist'))).not.toBe(original);
  });
});
