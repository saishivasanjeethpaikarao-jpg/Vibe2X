import { Track } from '../../core/types';

/** Both the menu and swipe action announce only a confirmed queue mutation. */
export function addWithQueueFeedback(
  track: Track,
  add: (track: Track) => boolean,
  show: (message: string) => void
): boolean {
  if (!add(track)) return false;
  show('Added to queue');
  return true;
}

/** ReanimatedSwipeable calls a rightward reveal `right` when left actions open. */
export function addFromQueueSwipe(
  direction: 'left' | 'right',
  track: Track,
  add: (track: Track) => boolean,
  show: (message: string) => void = () => undefined
): boolean {
  return direction === 'right' && addWithQueueFeedback(track, add, show);
}
