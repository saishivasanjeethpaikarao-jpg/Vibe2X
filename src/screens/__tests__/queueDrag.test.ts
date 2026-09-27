import { describe, expect, it } from 'vitest';
import { upcomingDropTarget, QueueDragItem } from '../queueDrag';

const t = (id: string, originalIndex: number, origin: 'manual' | 'smartContinue' = 'manual'): QueueDragItem => ({
  id: `track-${id}`, origin,
  track: { id, sourceId: id, provider: 'youtube', title: id, artist: { id: 'artist', name: 'Artist' }, albumImageUrl: '', duration: 100 },
});

describe('queue drag projection', () => {
  it('maps D dragged above B using stable track-only identities', () => {
    const before = [t('B', 0), t('C', 1), t('D', 2), t('S', 3, 'smartContinue')];
    const after = [t('D', 2), t('B', 0), t('C', 1), t('S', 3, 'smartContinue')];
    expect(upcomingDropTarget(before, after, 2)).toEqual({ trackId: 'D', toIndex: 0 });
  });

  it('allows automatic entries to be pinned and rejects invalid duplicate identities', () => {
    const before = [t('B', 0), t('C', 1), t('S', 2, 'smartContinue')];
    expect(upcomingDropTarget(before, [before[2], before[0], before[1]], 2)).toEqual({ trackId: 'S', toIndex: 0 });
    expect(upcomingDropTarget(before, before, 0)).toBeNull();
    expect(upcomingDropTarget(before, [before[0], before[0], before[2]], 1)).toBeNull();
  });
});
