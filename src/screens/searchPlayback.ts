import { Track } from '../core/types';

/** Selecting one search row must not turn the surrounding results into a queue. */
export const singleSearchTrackContext = (track: Track, query: string) => ({
  tracks: [track],
  label: `Search • ${query}`,
});
