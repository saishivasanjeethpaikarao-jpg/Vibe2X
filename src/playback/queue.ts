import { RepeatMode, Track } from '../core/types';

export type QueueEntry = {
  track: Track;
  origin: 'manual' | 'context' | 'smartContinue';
};

export type QueueSnapshot = {
  /** Tracks in their original (unshuffled) order. */
  tracks: Track[];
  /** Index into `tracks` of the item currently playing, or -1. */
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Where this queue came from, shown as "PLAYING FROM" in Now Playing. */
  context: string;
  /** Original collection entries are distinct from explicit Up Next actions. */
  contextTrackIds?: string[];
  /** Exact logical order; older snapshots without this field still restore. */
  order?: number[];
  position?: number;
};

export const EMPTY_QUEUE: QueueSnapshot = {
  tracks: [],
  index: -1,
  shuffle: false,
  repeat: 'off',
  context: '',
};

/**
 * The real queue behind the UI.
 *
 * Shuffle is modelled as a separate play order over the same array rather than
 * by mutating it, so toggling shuffle off restores the true order and never
 * loses or duplicates a track.
 */
export class Queue {
  private tracks: Track[] = [];
  private order: number[] = []; // play order, as indices into `tracks`
  private position = -1; // index into `order`
  private shuffleOn = false;
  private repeatMode: RepeatMode = 'off';
  private contextLabel = '';
  private contextTrackIds = new Set<string>();

  // ---- reads ------------------------------------------------------------

  get items(): Track[] {
    return [...this.tracks];
  }

  /** Upcoming tracks in the order they will actually play. */
  get upcoming(): Track[] {
    return this.order.slice(this.position + 1).map((i) => this.tracks[i]);
  }

  /** Ordered UI projection from the same play order consumed by next(). */
  get upcomingEntries(): QueueEntry[] {
    return this.order.slice(this.position + 1).map((index) => {
      const track = this.tracks[index];
      return {
        track,
        origin: track.isAutoSuggested
          ? 'smartContinue' as const
          : this.contextTrackIds.has(track.id)
            ? 'context' as const
            : 'manual' as const,
      };
    });
  }

  get manualUpcoming(): Track[] {
    return this.upcoming.filter((track) => !track.isAutoSuggested && !this.contextTrackIds.has(track.id));
  }

  get contextUpcoming(): Track[] {
    return this.upcoming.filter((track) => this.contextTrackIds.has(track.id));
  }

  get autoUpcoming(): Track[] {
    return this.upcoming.filter((track) => track.isAutoSuggested);
  }

  get current(): Track | null {
    const i = this.order[this.position];
    return i === undefined ? null : (this.tracks[i] ?? null);
  }

  get currentIndex(): number {
    return this.order[this.position] ?? -1;
  }

  get length(): number {
    return this.tracks.length;
  }

  get shuffle(): boolean {
    return this.shuffleOn;
  }

  get repeat(): RepeatMode {
    return this.repeatMode;
  }

  get context(): string {
    return this.contextLabel;
  }

  /** True when advancing would run off the end (and repeat is off). */
  get hasNext(): boolean {
    if (!this.tracks.length) return false;
    if (this.repeatMode !== 'off') return true;
    return this.position < this.order.length - 1;
  }

  get hasPrevious(): boolean {
    return this.tracks.length > 0;
  }

  snapshot(): QueueSnapshot {
    return {
      tracks: this.items,
      index: this.currentIndex,
      shuffle: this.shuffleOn,
      repeat: this.repeatMode,
      context: this.contextLabel,
      contextTrackIds: [...this.contextTrackIds],
      order: [...this.order],
      position: this.position,
    };
  }

  restore(snapshot: QueueSnapshot): void {
    this.tracks = [...(snapshot.tracks ?? [])];
    this.shuffleOn = snapshot.shuffle ?? false;
    this.repeatMode = snapshot.repeat ?? 'off';
    this.contextLabel = snapshot.context ?? '';
    this.contextTrackIds = new Set(snapshot.contextTrackIds ?? []);

    const storedOrder = snapshot.order;
    const validOrder = Array.isArray(storedOrder) &&
      storedOrder.length === this.tracks.length &&
      new Set(storedOrder).size === this.tracks.length &&
      storedOrder.every((index) => Number.isInteger(index) && index >= 0 && index < this.tracks.length);
    if (validOrder) {
      this.order = [...storedOrder];
      const storedPosition = snapshot.position;
      this.position = typeof storedPosition === 'number' && storedPosition >= -1 && storedPosition < this.order.length
        ? storedPosition
        : this.order.indexOf(snapshot.index ?? -1);
    } else {
      this.rebuildOrder();
      const startAt = snapshot.index ?? -1;
      this.position = startAt >= 0 ? this.order.indexOf(startAt) : -1;
    }
  }

  // ---- writes -----------------------------------------------------------

  /** Replace the whole queue and start at `startIndex`. */
  setTracks(tracks: Track[], startIndex = 0, context = ''): void {
    this.tracks = dedupe(tracks.map((track) => {
      if (!track.isAutoSuggested) return track;
      const { isAutoSuggested: _queueOnly, ...clean } = track;
      return clean;
    }));
    this.contextLabel = context;
    this.contextTrackIds = new Set(this.tracks.filter((item) => item.id !== tracks[startIndex]?.id).map((item) => item.id));

    // A de-dupe may have shifted the intended start.
    const target = tracks[startIndex];
    const resolvedStart = target
      ? Math.max(0, this.tracks.findIndex((t) => t.id === target.id))
      : 0;

    this.rebuildOrder(resolvedStart);
    this.position = this.order.indexOf(resolvedStart);
    if (this.position < 0) this.position = this.tracks.length ? 0 : -1;
  }

  /** Append explicit items before any automatically suggested tail. Returns the number added. */
  add(tracks: Track | Track[]): number {
    const incoming = Array.isArray(tracks) ? tracks : [tracks];
    // Explicitly queueing an automatic/context item promotes it to manual Up Next.
    for (const track of incoming) {
      if (track.isAutoSuggested) continue;
      const existing = this.upcoming.find((item) => item.id === track.id);
      if (existing && (existing.isAutoSuggested || this.contextTrackIds.has(track.id))) {
        this.remove(track.id, { keepCurrent: true });
      }
    }
    const seen = new Set(this.tracks.map((t) => t.id));
    const fresh = incoming.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id); // also dedupes within the incoming batch
      return true;
    });
    if (!fresh.length) return 0;

    const firstNew = this.tracks.length;
    this.tracks.push(...fresh);
    // Manually queued items must play before Smart Continue suggestions while
    // keeping the order of successive swipes. Automatic batches remain last.
    const firstAuto = this.order.findIndex(
      (trackIndex, position) =>
        position > this.position && (
          this.tracks[trackIndex]?.isAutoSuggested ||
          this.contextTrackIds.has(this.tracks[trackIndex]?.id)
        )
    );
    const insertAt = fresh.every((track) => track.isAutoSuggested) || firstAuto < 0
      ? this.order.length
      : firstAuto;
    this.order.splice(insertAt, 0, ...fresh.map((_, index) => firstNew + index));

    if (this.position < 0 && this.order.length) this.position = 0;
    return fresh.length;
  }

  /** Insert directly after the current track. */
  playNext(tracks: Track | Track[]): void {
    const incoming = Array.isArray(tracks) ? tracks : [tracks];
    if (!incoming.length) return;

    // Remove any existing copies so "play next" actually moves them.
    for (const t of incoming) this.remove(t.id, { keepCurrent: true });

    // Don't re-add the currently playing track (remove skipped it above).
    const currentId = this.current?.id;
    const toPush = incoming.filter((t) => t.id !== currentId);
    if (!toPush.length) return;

    const firstNew = this.tracks.length;
    this.tracks.push(...toPush);

    const insertAt = this.position + 1;
    const newOrder = toPush.map((_, i) => firstNew + i);
    this.order.splice(insertAt, 0, ...newOrder);

    if (this.position < 0 && this.order.length) this.position = 0;
  }

  /** Remove a track by id. Returns true if the current track was removed. */
  remove(trackId: string, opts: { keepCurrent?: boolean } = {}): boolean {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return false;

    const wasCurrent = this.currentIndex === trackIndex;
    if (wasCurrent && opts.keepCurrent) return false;

    // Remove ALL occurrences of this index from the play order.
    const orderPos = this.order.indexOf(trackIndex);
    this.tracks.splice(trackIndex, 1);
    this.contextTrackIds.delete(trackId);
    this.order = this.order.filter((i) => i !== trackIndex);
    // Every index after the removed one shifts down by one.
    this.order = this.order.map((i) => (i > trackIndex ? i - 1 : i));

    if (orderPos >= 0 && orderPos < this.position) {
      this.position -= 1;
    } else if (orderPos >= 0 && orderPos === this.position) {
      // Stay at the same slot so the next track takes its place.
      this.position = Math.min(this.position, this.order.length - 1);
    }
    if (!this.order.length) this.position = -1;

    return wasCurrent;
  }

  /** Move a track within the visible (play) order. */
  reorder(from: number, to: number): void {
    if (from === to) return;
    if (from < 0 || from >= this.order.length) return;

    const clampedTo = Math.max(0, Math.min(to, this.order.length - 1));
    const currentOrderValue = this.order[this.position];

    const [moved] = this.order.splice(from, 1);
    this.order.splice(clampedTo, 0, moved);

    // Keep pointing at the same track after the move.
    this.position = this.order.indexOf(currentOrderValue);
  }

  clear(): void {
    this.tracks = [];
    this.order = [];
    this.position = -1;
    this.contextLabel = '';
    this.contextTrackIds.clear();
  }

  /** Clear everything except the track currently playing. */
  clearUpcoming(): void {
    const current = this.current;
    if (!current) {
      this.clear();
      return;
    }
    this.tracks = [current];
    this.order = [0];
    this.position = 0;
    this.contextTrackIds.clear();
  }

  /** Clear explicitly queued future tracks, preserving current and automatic continuation. */
  clearManualUpcoming(): void {
    for (const track of this.manualUpcoming) {
      this.remove(track.id, { keepCurrent: true });
    }
  }

  clearAutoUpcoming(): void {
    for (const track of this.autoUpcoming) this.remove(track.id, { keepCurrent: true });
  }

  /** Atomically rerank only the automatic tail; manual/context play order stays intact. */
  replaceAutoUpcoming(tracks: Track[]): void {
    this.clearAutoUpcoming();
    this.add(tracks);
  }

  setShuffle(on: boolean): void {
    if (this.shuffleOn === on) return;
    this.shuffleOn = on;

    const currentTrackIndex = this.currentIndex;
    this.rebuildOrder(currentTrackIndex >= 0 ? currentTrackIndex : undefined);
    this.position = currentTrackIndex >= 0 ? this.order.indexOf(currentTrackIndex) : -1;
  }

  toggleShuffle(): boolean {
    this.setShuffle(!this.shuffleOn);
    return this.shuffleOn;
  }

  setRepeat(mode: RepeatMode): void {
    this.repeatMode = mode;
  }

  cycleRepeat(): RepeatMode {
    this.repeatMode =
      this.repeatMode === 'off' ? 'all' : this.repeatMode === 'all' ? 'one' : 'off';
    return this.repeatMode;
  }

  // ---- navigation -------------------------------------------------------

  /**
   * Advance to the next track.
   *
   * `auto` distinguishes a track finishing on its own (where repeat-one
   * replays the same track) from the user pressing next (where it does not).
   */
  next(auto = false): Track | null {
    if (!this.tracks.length) return null;

    if (auto && this.repeatMode === 'one') return this.current;

    if (this.position < this.order.length - 1) {
      this.position += 1;
      return this.current;
    }

    if (this.repeatMode === 'all' || (this.repeatMode === 'one' && !auto)) {
      // Reshuffle on wrap so a repeated shuffled queue is not identical.
      if (this.shuffleOn) this.rebuildOrder();
      this.position = 0;
      return this.current;
    }

    return null; // end of queue
  }

  /**
   * Move to the previous track.
   *
   * Returns the track to play, or `null` when at the start of the queue with
   * repeat off — callers should seek to 0:00 rather than re-resolving.
   */
  previous(): Track | null {
    if (!this.tracks.length) return null;

    if (this.position > 0) {
      this.position -= 1;
      return this.current;
    }

    if (this.repeatMode === 'all') {
      this.position = this.order.length - 1;
      return this.current;
    }

    return null; // already first: caller should seek to 0
  }

  /** Jump to a specific track by id. */
  jumpTo(trackId: string): Track | null {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return null;

    const orderPos = this.order.indexOf(trackIndex);
    if (orderPos < 0) return null;

    this.position = orderPos;
    return this.current;
  }

  /** Peek at what next() would return, without moving. */
  peekNext(): Track | null {
    if (!this.tracks.length) return null;
    if (this.position < this.order.length - 1) {
      return this.tracks[this.order[this.position + 1]] ?? null;
    }
    if (this.repeatMode === 'all') return this.tracks[this.order[0]] ?? null;
    return null;
  }

  // ---- internals --------------------------------------------------------

  /**
   * Rebuild the play order. When shuffling, `pinFirst` is placed at the head
   * so toggling shuffle never interrupts the track already playing.
   */
  private rebuildOrder(pinFirst?: number): void {
    const indices = this.tracks.map((_, i) => i);

    if (!this.shuffleOn) {
      this.order = indices;
      return;
    }

    const rest = pinFirst === undefined ? indices : indices.filter((i) => i !== pinFirst);
    const manual = rest.filter((i) => !this.tracks[i]?.isAutoSuggested && !this.contextTrackIds.has(this.tracks[i]?.id));
    const context = rest.filter((i) => this.contextTrackIds.has(this.tracks[i]?.id));
    const automatic = rest.filter((i) => this.tracks[i]?.isAutoSuggested);

    // Shuffle within each group, never ahead of an explicitly queued track.
    for (const group of [manual, context, automatic]) {
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
    }

    this.order = pinFirst === undefined
      ? [...manual, ...context, ...automatic]
      : [pinFirst, ...manual, ...context, ...automatic];
  }
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
