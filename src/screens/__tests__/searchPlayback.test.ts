import { describe, expect, it } from 'vitest';
import { singleSearchTrackContext } from '../searchPlayback';
import { Queue } from '../../playback/queue';
import { Track } from '../../core/types';

const track = (id: string): Track => ({ id, title: id, artist: { id, name: id }, albumImageUrl: '', duration: 180, provider: 'youtube', sourceId: id });

describe('single search row playback', () => {
  it('does not queue unrelated search results after the selected song', () => {
    const selected = track('A');
    const searchResults = [selected, track('B'), track('C')];
    const context = singleSearchTrackContext(searchResults[0], 'test');
    const queue = new Queue();
    queue.setTracks(context.tracks, 0, context.label);
    expect(queue.current?.id).toBe('A');
    expect(queue.upcoming).toEqual([]);
    expect(queue.next(true)).toBeNull();
  });
});
