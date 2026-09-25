import { describe, expect, it } from 'vitest';
import { Queue } from '../queue';
import { Track } from '../../core/types';

function mockTrack(id: string, opts?: Partial<Track>): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: { id: `artist-${id}`, name: opts?.artist?.name ?? `Artist ${id}` },
    albumImageUrl: '',
    duration: 180,
    provider: 'youtube' as const,
    sourceId: id,
    ...opts,
  };
}

describe('Queue', () => {
  it('single search result does not create hidden result queue', () => {
    const queue = new Queue();
    const trackA = mockTrack('A');
    queue.setTracks([trackA]);
    expect(queue.length).toBe(1);
    expect(queue.items).toEqual([trackA]);
  });

  it('add() mutates actual queue and returns count', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);

    const trackB = mockTrack('B');
    const addedCount = queue.add(trackB);

    expect(addedCount).toBe(1);
    expect(queue.upcoming).toContainEqual(trackB);
    expect(queue.length).toBe(2);
  });

  it('projects only the active item away: A current, B manual is visible', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);
    queue.add(mockTrack('B'));
    expect(queue.current?.id).toBe('A');
    expect(queue.upcomingEntries.map(({ track, origin }) => [track.id, origin]))
      .toEqual([['B', 'manual']]);
  });

  it('projects Smart Continue and manual items in the actual play order', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);
    queue.add([mockTrack('B', { isAutoSuggested: true }), mockTrack('C', { isAutoSuggested: true })]);
    expect(queue.upcomingEntries.map(({ track, origin }) => [track.id, origin]))
      .toEqual([['B', 'smartContinue'], ['C', 'smartContinue']]);
    queue.add(mockTrack('X'));
    expect(queue.upcomingEntries.map(({ track, origin }) => [track.id, origin]))
      .toEqual([['X', 'manual'], ['B', 'smartContinue'], ['C', 'smartContinue']]);
  });

  it('updates the visible projection immediately after mutation and advancement', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);
    expect(queue.upcomingEntries).toEqual([]);
    queue.add(mockTrack('B'));
    expect(queue.upcomingEntries.map((entry) => entry.track.id)).toEqual(['B']);
    expect(queue.next(true)?.id).toBe('B');
    expect(queue.upcomingEntries).toEqual([]);
  });

  it('keeps entry origins and order after reloading a queue snapshot', () => {
    const before = new Queue();
    before.setTracks([mockTrack('A'), mockTrack('P')], 0, 'Playlist');
    before.add(mockTrack('S', { isAutoSuggested: true }));
    before.add(mockTrack('M'));
    const after = new Queue();
    after.restore(before.snapshot());
    expect(after.upcomingEntries.map(({ track, origin }) => [track.id, origin]))
      .toEqual([['M', 'manual'], ['P', 'context'], ['S', 'smartContinue']]);
  });

  it('reranks only the automatic tail without changing manual priority', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);
    queue.add([mockTrack('B', { isAutoSuggested: true }), mockTrack('C', { isAutoSuggested: true })]);
    queue.add(mockTrack('X'));
    queue.replaceAutoUpcoming([mockTrack('D', { isAutoSuggested: true }), mockTrack('B', { isAutoSuggested: true })]);
    expect(queue.upcomingEntries.map(({ track, origin }) => [track.id, origin]))
      .toEqual([['X', 'manual'], ['D', 'smartContinue'], ['B', 'smartContinue']]);
    expect(queue.next(true)?.id).toBe('X');
    expect(queue.next(true)?.id).toBe('D');
  });

  it('multiple queue additions preserve order', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);

    const trackB = mockTrack('B');
    const trackC = mockTrack('C');

    queue.add(trackB);
    queue.add(trackC);

    expect(queue.upcoming).toEqual([trackB, trackC]);
  });

  it('manual queue takes priority over Smart Continue', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);

    const autoTrack = mockTrack('Auto1', { isAutoSuggested: true });
    queue.add(autoTrack);

    const manualTrack = mockTrack('Manual1');
    queue.add(manualTrack);

    expect(queue.upcoming).toEqual([manualTrack, autoTrack]);
  });

  it('manual additions override collection context and clear without removing auto', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A'), mockTrack('B'), mockTrack('C')], 0, 'Liked Songs');
    queue.add(mockTrack('Auto', { isAutoSuggested: true }));
    queue.add(mockTrack('X'));
    expect(queue.upcoming.map((item) => item.id)).toEqual(['X', 'B', 'C', 'Auto']);
    expect(queue.manualUpcoming.map((item) => item.id)).toEqual(['X']);
    expect(queue.contextUpcoming.map((item) => item.id)).toEqual(['B', 'C']);
    queue.clearManualUpcoming();
    expect(queue.current?.id).toBe('A');
    expect(queue.upcoming.map((item) => item.id)).toEqual(['B', 'C', 'Auto']);
  });

  it('promotes an automatic candidate when the user explicitly queues it', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);
    queue.add([mockTrack('B', { isAutoSuggested: true }), mockTrack('C', { isAutoSuggested: true })]);
    expect(queue.add(mockTrack('C'))).toBe(1);
    expect(queue.upcoming.map((item) => item.id)).toEqual(['C', 'B']);
    expect(queue.manualUpcoming.map((item) => item.id)).toEqual(['C']);
  });

  it('stop at end of queue removes automatic continuation but preserves manual tracks', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);
    queue.add(mockTrack('B'));
    queue.add(mockTrack('C', { isAutoSuggested: true }));
    queue.clearAutoUpcoming();
    expect(queue.upcoming.map((item) => item.id)).toEqual(['B']);
    expect(queue.next(true)?.id).toBe('B');
    expect(queue.next(true)).toBeNull();
  });

  it('restores exact manual/context/automatic playback order after restart', () => {
    const before = new Queue();
    before.setTracks([mockTrack('A'), mockTrack('B')], 0, 'Playlist');
    before.add(mockTrack('C', { isAutoSuggested: true }));
    before.add(mockTrack('X'));
    const after = new Queue();
    after.restore(before.snapshot());
    expect(after.upcoming.map((item) => item.id)).toEqual(['X', 'B', 'C']);
    expect(after.manualUpcoming.map((item) => item.id)).toEqual(['X']);
  });

  it('Smart Continue tracks appended at end', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);

    const trackB = mockTrack('B');
    queue.add(trackB);

    const autoTrack1 = mockTrack('Auto1', { isAutoSuggested: true });
    const autoTrack2 = mockTrack('Auto2', { isAutoSuggested: true });
    queue.add([autoTrack1, autoTrack2]);

    expect(queue.upcoming).toEqual([trackB, autoTrack1, autoTrack2]);
  });

  it('duplicate tracks are not added', () => {
    const queue = new Queue();
    const trackA = mockTrack('A');
    queue.setTracks([trackA]);

    const addedCount = queue.add(trackA);
    expect(addedCount).toBe(0);
    expect(queue.length).toBe(1);
  });

  it('add to empty queue sets position', () => {
    const queue = new Queue();
    queue.add(mockTrack('A'));
    expect(queue.currentIndex).toBe(0);
    expect(queue.current?.id).toBe('A');
  });

  it('manual tracks inserted before auto-suggested in order', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('Current')]);

    const auto1 = mockTrack('Auto1', { isAutoSuggested: true });
    const auto2 = mockTrack('Auto2', { isAutoSuggested: true });
    queue.add([auto1, auto2]);

    const manual1 = mockTrack('Manual1');
    queue.add(manual1);

    const manual2 = mockTrack('Manual2');
    queue.add(manual2);

    expect(queue.upcoming).toEqual([manual1, manual2, auto1, auto2]);
  });

  it('keeps manual tracks ahead of Smart Continue with shuffle on', () => {
    const queue = new Queue();
    queue.setTracks([mockTrack('A')]);
    queue.add([mockTrack('Auto1', { isAutoSuggested: true }), mockTrack('Auto2', { isAutoSuggested: true })]);
    queue.add([mockTrack('B'), mockTrack('C')]);
    queue.setShuffle(true);

    expect(queue.current?.id).toBe('A');
    expect(queue.upcoming.slice(0, 2).map((track) => track.id).sort()).toEqual(['B', 'C']);
    expect(queue.upcoming.slice(2).every((track) => track.isAutoSuggested)).toBe(true);
  });
});
