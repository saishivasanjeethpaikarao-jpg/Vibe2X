/** Shared playback intent state. The native player, not the selected row, confirms Playing. */
import type { ErrorKind } from '../core/errors';

export type TransitionState =
  | 'idle'
  | 'resolving'
  | 'preparing'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'failed';

export type TransitionFeedback = 'hidden' | 'preparing' | 'long' | 'failed';

export const PREPARING_FEEDBACK_MS = 350;
export const LONG_WAIT_FEEDBACK_MS = 5_000;

export function feedbackFor(state: TransitionState, elapsedMs: number): TransitionFeedback {
  if (state === 'failed') return 'failed';
  if (state !== 'resolving' && state !== 'preparing' && state !== 'buffering') return 'hidden';
  if (elapsedMs < PREPARING_FEEDBACK_MS) return 'hidden';
  return elapsedMs >= LONG_WAIT_FEEDBACK_MS ? 'long' : 'preparing';
}

/** Only definite item failures (or a failed automatic stream) advance automatically. */
export function shouldSkipFailedCandidate(
  kind: ErrorKind,
  isAutomatic: boolean,
  hasNext: boolean,
  skipped: number,
  maximum: number
): boolean {
  if (!hasNext || skipped >= maximum) return false;
  return kind === 'track_unavailable' || kind === 'region_restricted' ||
    kind === 'source_unavailable' || (isAutomatic && kind === 'playback_failed');
}

/** Prevents a duplicate tap from starting another resolve and rejects stale completions. */
export class PlaybackTransition {
  private generation = 0;
  private targetId: string | null = null;
  private phase: TransitionState = 'idle';

  begin(trackId: string): number | null {
    if (this.targetId === trackId && this.isPending) return null;
    this.targetId = trackId;
    this.phase = 'resolving';
    return ++this.generation;
  }

  get isPending(): boolean {
    return this.phase === 'resolving' || this.phase === 'preparing' || this.phase === 'buffering';
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  advance(generation: number, state: TransitionState): boolean {
    if (!this.isCurrent(generation)) return false;
    this.phase = state;
    if (state === 'playing' || state === 'paused' || state === 'idle') this.targetId = null;
    return true;
  }

  reset(): void {
    this.generation++;
    this.targetId = null;
    this.phase = 'idle';
  }
}
