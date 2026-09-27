import { QueueEntry } from '../playback/queue';

export type QueueDragItem = QueueEntry & { id: string; sectionTitle?: string };

/** Only tracks are draggable; headers are presentation and never list keys. */
export function upcomingDropTarget(before: readonly QueueDragItem[], after: readonly QueueDragItem[], from: number): { trackId: string; toIndex: number } | null {
  const moved = before[from];
  if (!moved || before.length !== after.length) return null;
  const toIndex = after.findIndex((item) => item.id === moved.id);
  if (toIndex < 0 || toIndex === from || new Set(after.map((item) => item.id)).size !== after.length) return null;
  return { trackId: moved.track.id, toIndex };
}
