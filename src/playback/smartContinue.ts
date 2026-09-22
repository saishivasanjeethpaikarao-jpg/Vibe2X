import { Track } from '../core/types';

export type Listen = { track: Track; playedAt: number };

export function mayStartSmartContinue(input: {
  trackCompleted: boolean;
  hasUpcoming: boolean;
  enabled: boolean;
  sleepTimerExpired: boolean;
}): boolean {
  return input.trackCompleted && !input.hasUpcoming && input.enabled && !input.sleepTimerExpired;
}

/**
 * Hour-distance between two times of day, wrapping around midnight.
 * Returns 0–12 (e.g. 2am vs 10pm = 4 hours, not 20).
 */
function hourDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return diff > 12 ? 24 - diff : diff;
}

/** A local, stable continuation. No search-result ordering or network call is involved. */
export function chooseSmartContinue(
  current: Track,
  listens: Listen[],
  liked: Track[],
  excludedIds: ReadonlySet<string>,
  limit = 10
): Track[] {
  const candidates = new Map<string, { track: Track; score: number; lastPlayed: number }>();
  const currentArtist = current.artist.name.trim().toLocaleLowerCase();
  const currentHour = new Date().getHours();

  const consider = (track: Track, playedAt: number, likedTrack: boolean) => {
    if (track.id === current.id || excludedIds.has(track.id)) return;
    const previous = candidates.get(track.id);
    const artistMatch = track.artist.name.trim().toLocaleLowerCase() === currentArtist;

    // Time-of-day signal: tracks played within ±2 hours of now score higher.
    let timeScore = 0;
    if (playedAt > 0) {
      const playedHour = new Date(playedAt).getHours();
      const dist = hourDistance(playedHour, currentHour);
      if (dist <= 2) timeScore = 2;
      else if (dist <= 4) timeScore = 1;
    }

    const score = (artistMatch ? 4 : 0) + (likedTrack ? 3 : 0) + timeScore + (previous ? 1 : 0);
    candidates.set(track.id, {
      track,
      score: Math.max(score, previous?.score ?? 0),
      lastPlayed: Math.max(playedAt, previous?.lastPlayed ?? 0),
    });
  };

  for (const entry of listens) consider(entry.track, entry.playedAt, false);
  for (const track of liked) consider(track, 0, true);

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.lastPlayed - a.lastPlayed || a.track.id.localeCompare(b.track.id))
    .slice(0, limit)
    .map(({ track }) => ({ ...track, isAutoSuggested: true }));
}
