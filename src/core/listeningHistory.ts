import type { HistoryEntry } from './lie';
import { logicalSongKey } from './logicalSong';

export type ListeningHistoryRow = HistoryEntry & { playCount: number };

/** Aggregate meaningful listen events without changing the underlying event log. */
export function groupListeningHistory(entries: HistoryEntry[]): ListeningHistoryRow[] {
  const bySong = new Map<string, ListeningHistoryRow>();
  for (const entry of entries) {
    const key = logicalSongKey(entry.track);
    const existing = bySong.get(key);
    if (!existing) bySong.set(key, { ...entry, playCount: 1 });
    else {
      existing.playCount++;
      if (entry.playedAt > existing.playedAt) {
        existing.id = entry.id;
        existing.track = entry.track;
        existing.playedAt = entry.playedAt;
      }
    }
  }
  return [...bySong.values()].sort((a, b) => b.playedAt - a.playedAt);
}
