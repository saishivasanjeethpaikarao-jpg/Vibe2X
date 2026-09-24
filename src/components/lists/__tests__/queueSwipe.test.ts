import { describe, expect, it, vi } from 'vitest';
import { Queue } from '../../../playback/queue';
import { Track } from '../../../core/types';
import { addFromQueueSwipe, addWithQueueFeedback } from '../queueSwipe';

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

  it('menu and swipe use the same post-mutation feedback path', () => {
    const queue = new Queue();
    queue.setTracks([track('A')]);
    const add = (item: Track) => queue.add(item) > 0;
    const show = vi.fn();
    expect(addWithQueueFeedback(track('B'), add, show)).toBe(true);
    expect(addFromQueueSwipe('right', track('C'), add, show)).toBe(true);
    expect(queue.upcoming.map((item) => item.id)).toEqual(['B', 'C']);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenNthCalledWith(1, 'Added to queue');
    expect(show).toHaveBeenNthCalledWith(2, 'Added to queue');
  });

  it('does not announce an unsuccessful or duplicate addition', () => {
    const queue = new Queue();
    queue.setTracks([track('A')]);
    const add = (item: Track) => queue.add(item) > 0;
    const show = vi.fn();
    expect(addWithQueueFeedback(track('B'), add, show)).toBe(true);
    expect(addWithQueueFeedback(track('B'), add, show)).toBe(false);
    expect(addFromQueueSwipe('left', track('C'), add, show)).toBe(false);
    expect(show).toHaveBeenCalledTimes(1);
  });
});
