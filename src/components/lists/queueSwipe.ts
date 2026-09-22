import { Track } from '../../core/types';

/** ReanimatedSwipeable calls a rightward reveal `right` when left actions open. */
export function addFromQueueSwipe(
  direction: 'left' | 'right',
  track: Track,
  add: (track: Track) => boolean
): boolean {
  return direction === 'right' && add(track);
}
