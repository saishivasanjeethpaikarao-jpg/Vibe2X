import { describe, expect, it } from 'vitest';
import { Track } from '../types';
import { logicalSongKey, sameLogicalRecording } from '../logicalSong';

const track = (title: string, artist = 'Banjaare'): Track => ({
  id: `youtube:${title}:${artist}`, sourceId: title, provider: 'youtube',
  title, artist: { id: artist, name: artist }, albumImageUrl: '', duration: 190,
});

describe('logical song identity', () => {
  it('deduplicates presentation variants and a matching artist suffix', () => {
    const original = logicalSongKey(track('Bairan'));
    for (const title of ['BAIRAN (LYRICS)', 'Bairan - Banjaare', 'Bairan [Official Audio]', 'Bairan - Full Video', 'Bairan WhatsApp Status', 'Bairan HD']) {
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

  it('collapses common Romanized long-vowel spellings without merging real versions', () => {
    expect(logicalSongKey(track('Ori Vaari', 'Santhosh Narayanan'))).toBe(
      logicalSongKey(track('Ori Vari Lyrics', 'Santhosh Narayanan'))
    );
    expect(logicalSongKey(track('Ori Vaari Live', 'Santhosh Narayanan'))).not.toBe(
      logicalSongKey(track('Ori Vari', 'Santhosh Narayanan'))
    );
  });
  it('requires corroborating album and duration to merge different uploaders', () => {
    const original = { ...track('Ori Vaari', 'Original Channel'), album: 'Dasara', duration: 228 };
    const repost = { ...track('Ori Vari Official Audio', 'Another Channel'), album: 'Dasara', duration: 231 };
    const cover = { ...track('Ori Vari', 'Cover Singer'), album: 'Independent', duration: 231 };
    expect(sameLogicalRecording(original, repost)).toBe(true);
    expect(sameLogicalRecording(original, cover)).toBe(false);
  });
});
