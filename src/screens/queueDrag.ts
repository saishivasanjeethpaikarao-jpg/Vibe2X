import { QueueEntry } from '../playback/queue';

export type QueueDragItem =
  | { type: 'header'; id: string; title: string }
  | { type: 'track'; id: string; track: QueueEntry['track']; origin: QueueEntry['origin']; originalIndex: number };

/** Translate a visual drag (which includes headers) into a manual-queue mutation. */
export function manualDropTarget(before: QueueDragItem[], after: QueueDragItem[], from: number): { trackId: string; toIndex: number } | null {
  const moved = before[from];
  if (!moved || moved.type !== 'track' || moved.origin !== 'manual') return null;
  const oldManual = before.filter((item) => item.type === 'track' && item.origin === 'manual');
  const newTracks = after.filter((item) => item.type === 'track');
  const toIndex = newTracks.findIndex((item) => item.id === moved.id);
  if (toIndex < 0 || toIndex >= oldManual.length || oldManual.findIndex((item) => item.id === moved.id) === toIndex) return null;
  return { trackId: moved.track.id, toIndex };
}
