import { describe, expect, it } from 'vitest';
import { manualDropTarget, QueueDragItem } from '../queueDrag';

const t = (id: string, originalIndex: number, origin: 'manual' | 'smartContinue' = 'manual'): QueueDragItem => ({
  type: 'track', id: `track-${id}`, originalIndex, origin,
  track: { id, sourceId: id, provider: 'youtube', title: id, artist: { id: 'artist', name: 'Artist' }, albumImageUrl: '', duration: 100 },
});
const header = (id: string): QueueDragItem => ({ type: 'header', id, title: id });

describe('queue drag projection', () => {
  it('maps D dragged above B to manual index zero, ignoring the section header', () => {
    const before = [header('Up Next'), t('B', 0), t('C', 1), t('D', 2), header('Smart Continue'), t('S', 3, 'smartContinue')];
    const after = [header('Up Next'), t('D', 2), t('B', 0), t('C', 1), header('Smart Continue'), t('S', 3, 'smartContinue')];
    expect(manualDropTarget(before, after, 3)).toEqual({ trackId: 'D', toIndex: 0 });
  });

  it('does not move headers, automatic items, or manual items into Smart Continue', () => {
    const before = [header('Up Next'), t('B', 0), t('C', 1), header('Smart Continue'), t('S', 2, 'smartContinue')];
    expect(manualDropTarget(before, before, 0)).toBeNull();
    expect(manualDropTarget(before, before, 4)).toBeNull();
    const crossed = [header('Up Next'), t('C', 1), header('Smart Continue'), t('S', 2, 'smartContinue'), t('B', 0)];
    expect(manualDropTarget(before, crossed, 1)).toBeNull();
  });
});
