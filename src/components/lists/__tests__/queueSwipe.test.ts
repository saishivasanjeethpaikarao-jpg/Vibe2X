import { describe, expect, it, vi } from 'vitest';
import { Queue } from '../../../playback/queue';
import { Track } from '../../../core/types';
import { addFromQueueSwipe } from '../queueSwipe';

const track = (id: string): Track => ({ id, title: id, artist: { id, name: id }, albumImageUrl: '', duration: 180, provider: 'youtube', sourceId: id });

describe('TrackRow queue swipe', () => {
  it('right swipe adds B then C to the authoritative queue after A', () => {
    const queue = new Queue();
    queue.setTracks([track('A')]);
    const add = (item: Track) => queue.add(item) > 0;
    expect(addFromQueueSwipe('right', track('B'), add)).toBe(true);
    expect(addFromQueueSwipe('right', track('C'), add)).toBe(true);
    expect(queue.upcoming.map((item) => item.id)).toEqual(['B', 'C']);
    expect(queue.next(true)?.id).toBe('B');
    expect(queue.next(true)?.id).toBe('C');
  });

  it('left swipe does not mutate or announce success', () => {
    const add = vi.fn(() => true);
    expect(addFromQueueSwipe('left', track('B'), add)).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });
});
