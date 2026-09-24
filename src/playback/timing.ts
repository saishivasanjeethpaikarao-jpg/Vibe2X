export type PlaybackMilestone =
  | 'intent'
  | 'resolverStart'
  | 'resolverComplete'
  | 'nativeLoadStart'
  | 'nativeReady'
  | 'firstPlaying';

type PlaybackTimingResult = Partial<Record<PlaybackMilestone, number>> & {
  attempt: number;
  outcome: 'playing' | 'failed' | 'superseded';
  preloaded: boolean;
};

const QA_TIMING = process.env.EXPO_PUBLIC_PLAYBACK_QA_TIMING === '1';
const recent: PlaybackTimingResult[] = [];
let nextAttempt = 0;

/** No stream URL, headers, token, query, title or credential is recorded. */
export class PlaybackTiming {
  private readonly attempt = ++nextAttempt;
  private readonly startedAt: number;
  private marks: Partial<Record<PlaybackMilestone, number>> = { intent: 0 };
  private finished = false;

  constructor(private readonly preloaded: boolean, now = Date.now, startedAt = now()) {
    this.now = now;
    this.startedAt = startedAt;
  }

  private readonly now: () => number;

  mark(stage: PlaybackMilestone): void {
    if (this.finished || this.marks[stage] !== undefined) return;
    this.marks[stage] = Math.max(0, this.now() - this.startedAt);
  }

  finish(outcome: PlaybackTimingResult['outcome']): PlaybackTimingResult {
    const result = { ...this.marks, attempt: this.attempt, outcome, preloaded: this.preloaded };
    if (!this.finished) {
      this.finished = true;
      recent.push(result);
      if (recent.length > 20) recent.shift();
      if ((typeof __DEV__ !== 'undefined' && __DEV__) || QA_TIMING) {
        console.info('[playback-timing]', JSON.stringify(result));
      }
    }
    return result;
  }
}

/** Last 20 local QA attempts; never persisted or sent to a server. */
export function getRecentPlaybackTimings(): readonly PlaybackTimingResult[] {
  return [...recent];
}
