import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../lie';
import { groupListeningHistory } from '../listeningHistory';

const entry = (id: string, title: string, playedAt: number, artist = 'Banjaare'): HistoryEntry => ({
  id, playedAt,
  track: { id: `youtube:${id}`, sourceId: id, provider: 'youtube', title,
    artist: { id: artist, name: artist }, albumImageUrl: '', duration: 190 },
});

describe('meaningful listening history projection', () => {
  it('combines existing uploads into one row with count and latest time', () => {
    const rows = groupListeningHistory([
      entry('old', 'Bairan - Banjaare', 100),
      entry('other', 'Unrelated', 150),
      entry('latest', 'BAIRAN (LYRICS)', 200),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'latest', playCount: 2, playedAt: 200 });
    expect(rows[1]).toMatchObject({ id: 'other', playCount: 1, playedAt: 150 });
  });

  it('does not combine distinct editions or artists', () => {
    const rows = groupListeningHistory([
      entry('original', 'Bairan', 100),
      entry('live', 'Bairan Live', 110),
      entry('cover', 'Bairan', 120, 'Different Artist'),
    ]);
    expect(rows).toHaveLength(3);
  });
});
