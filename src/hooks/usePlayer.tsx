import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { AppError, messageFor, toAppError } from '../core/errors';
import { RepeatMode, Track } from '../core/types';
import { flushWrites, readJson, writeJsonDebounced, STORAGE_KEYS } from '../core/storage';
import { playbackEngine, IDLE_STATUS, PlaybackStatus } from '../playback/PlaybackEngine';
import { Queue, QueueEntry, QueueSnapshot, EMPTY_QUEUE } from '../playback/queue';
import { preloader } from '../playback/preload';
import { endpointSource } from '../providers/stream/StreamResolver';
import { LibraryService } from '../services/LibraryService';
import { MusicService } from '../services/MusicService';
import { getSuppressedTrackIds, getRecentTrackIds } from '../core/lie';
import { logicalSongKey } from '../core/logicalSong';
import { AutoContinueManager, RecommendationSignals } from '../playback/AutoContinueManager';
import {
  feedbackFor,
  LONG_WAIT_FEEDBACK_MS,
  PlaybackTransition,
  PREPARING_FEEDBACK_MS,
  shouldSkipFailedCandidate,
  TransitionFeedback,
  TransitionState,
} from '../playback/transition';
import { PlaybackTiming } from '../playback/timing';
import { streamResolver } from '../providers/stream/StreamResolver';

type PlayerContextType = {
  // --- core player state used by every screen ---
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track, context?: { tracks?: Track[]; label?: string; candidates?: Track[]; query?: string }) => void;
  togglePlayPause: () => void;

  // --- everything the real player adds ---
  isLoading: boolean;
  isBuffering: boolean;
  error: string | null;
  clearError: () => void;
  retry: () => void;

  duration: number;
  volume: number;
  setVolume: (v: number) => void;
  sleepTimerExpiration: number | null;
  setSleepTimer: (minutes: number | null) => void;
  stopAtEndOfQueue: boolean;
  setStopAtEndOfQueue: (enabled: boolean) => void;
  seekTo: (seconds: number) => void;
  /** Jump relative to the current position. Negative rewinds. */
  seekBy: (deltaSeconds: number) => void;

  next: () => void;
  previous: () => void;
  hasNext: boolean;
  hasPrevious: boolean;

  queue: Track[];
  upcoming: Track[];
  upcomingEntries: QueueEntry[];
  manualUpcoming: Track[];
  contextUpcoming: Track[];
  autoUpcoming: Track[];
  queueContext: string;
  isPreparingAuto: boolean;
  pendingTrack: Track | null;
  transitionState: TransitionState;
  transitionFeedback: TransitionFeedback;
  addToQueue: (tracks: Track | Track[]) => boolean;
  playNext: (tracks: Track | Track[]) => void;
  removeFromQueue: (trackId: string) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpTo: (trackId: string) => void;

  shuffle: boolean;
  toggleShuffle: () => void;
  repeat: RepeatMode;
  cycleRepeat: () => void;

  isReady: boolean;
  canPlayCurrent: boolean;
};

/**
 * How long a track must actually play before it counts as a listen.
 *
 * Tapping a track and skipping it immediately is not listening, so history is
 * gated on real playback rather than on intent. Short tracks use a proportion
 * instead, so a 30s clip is not excluded by a fixed threshold.
 */
const HISTORY_MIN_SECONDS = 20;
const HISTORY_MIN_RATIO = 0.25;

/** How many unplayable tracks in a row we step over before giving up. */
const MAX_AUTO_SKIPS = 3;

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

/**
 * Progress lives in its own context because it updates ~4x a second. Screens
 * that only need the current track never re-render on a position tick.
 */
const ProgressContext = createContext<{ position: number; duration: number }>({
  position: 0,
  duration: 0,
});

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queueRef = useRef(new Queue());
  const autoManager = useRef(new AutoContinueManager({
    related: (track, signal) => MusicService.getRelated(track, signal),
    search: async (query, signal) => (await MusicService.search(query, { signal, filter: 'Songs', limit: 20 })).tracks,
    canPlay: (track) => MusicService.canPlay(track),
  }));
  const autoSession = useRef(0);
  const autoFill = useRef<Promise<void> | null>(null);
  const lastAutoEnabled = useRef<boolean | null>(null);
  const sessionSkippedIds = useRef(new Set<string>());
  const refreshAfterNext = useRef(false);
  const lastLikedSignature = useRef<string | null>(null);
  const confirmedTrack = useRef<Track | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>(IDLE_STATUS);
  /**
   * Mirror of  for callbacks that only READ it.
   *
   * Position ticks ~4x a second. A callback that lists status.position in its
   * deps is rebuilt just as often, and because these callbacks sit in the
   * context value, that rebuilt the whole value 4x a second -- re-rendering
   * every screen using usePlayer and undoing the progress isolation.
   */
  const statusRef = useRef<PlaybackStatus>(IDLE_STATUS);
  statusRef.current = status;
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<Track | null>(null);
  const [transitionState, setTransitionState] = useState<TransitionState>('idle');
  const [transitionFeedback, setTransitionFeedback] = useState<TransitionFeedback>('hidden');
  const transition = useRef(new PlaybackTransition());
  const feedbackTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bufferingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bufferingSince = useRef<number | null>(null);
  const activeTiming = useRef<PlaybackTiming | null>(null);
  const nextIntent = useRef(0);
  const failureActive = useRef(false);
  const transitioning = useRef(false);
  const [isPreparingAuto, setIsPreparingAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [sleepTimerExpiration, setSleepTimerExpiration] = useState<number | null>(null);
  const sleepTimerUntil = useRef<number | null>(null);
  const stopAtEndRef = useRef(false);
  const [stopAtEndOfQueue, setStopAtEndState] = useState(false);

  /** Cancels an in-flight load when the user starts another one. */
  const loadAbort = useRef<AbortController | null>(null);
  /** Identifies the newest load so stale async work can bail out. */
  const loadId = useRef(0);
  /** The track we most recently attempted, for retry(). */
  const lastAttempt = useRef<{ track: Track; position: number } | null>(null);
  /** Which track the in-flight load belongs to, so we never abort our own. */
  const loadingTrackId = useRef<string | null>(null);
  /**
   * Consecutive tracks auto-skipped because they would not play. Bounded so a
   * queue full of dead videos stops instead of racing to the end.
   */
  const autoSkips = useRef(0);
  /** Load id whose listen has already been written to history. */
  const historyWrittenFor = useRef<number | null>(null);

  const bumpQueue = useCallback(() => setQueueVersion((v) => v + 1), []);

  const clearFeedbackTimers = useCallback(() => {
    feedbackTimers.current.forEach(clearTimeout);
    feedbackTimers.current = [];
  }, []);

  const clearBufferingTimers = useCallback(() => {
    bufferingTimers.current.forEach(clearTimeout);
    bufferingTimers.current = [];
    bufferingSince.current = null;
  }, []);

  const startFeedbackTimers = useCallback((id: number) => {
    clearFeedbackTimers();
    setTransitionFeedback('hidden');
    feedbackTimers.current = [
      setTimeout(() => {
        if (transition.current.isCurrent(id) && transition.current.isPending) {
          setTransitionFeedback(feedbackFor('resolving', PREPARING_FEEDBACK_MS));
        }
      }, PREPARING_FEEDBACK_MS),
      setTimeout(() => {
        if (transition.current.isCurrent(id) && transition.current.isPending) {
          setTransitionFeedback(feedbackFor('resolving', LONG_WAIT_FEEDBACK_MS));
        }
      }, LONG_WAIT_FEEDBACK_MS),
    ];
  }, [clearFeedbackTimers]);

  useEffect(() => {
    if (transitionFeedback === 'hidden') return;
    const message = transitionFeedback === 'failed'
      ? "Couldn't play this song. Retry or skip."
      : transitionFeedback === 'long'
        ? 'Taking a little longer…'
        : 'Getting your next vibe…';
    AccessibilityInfo.announceForAccessibility(message);
  }, [transitionFeedback]);

  const persistQueue = useCallback(() => {
    writeJsonDebounced(STORAGE_KEYS.queue, queueRef.current.snapshot(), 600);
  }, []);

  const signals = useCallback((recentIds = new Set<string>(), suppressedIds = new Set<string>()): RecommendationSignals => {
    const history = LibraryService.getHistory();
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    return {
      liked: LibraryService.getLiked(),
      history,
      searches: LibraryService.getSearchHistory(),
      recentIds: new Set([...recentIds, ...history.filter((entry) => entry.playedAt >= cutoff).map((entry) => entry.track.id)]),
      suppressedIds: new Set([...suppressedIds, ...sessionSkippedIds.current]),
    };
  }, []);

  const fillAuto = useCallback((refresh = false): Promise<void> => {
    if (!LibraryService.getSettings().autoplayRelated || !queueRef.current.current || stopAtEndRef.current) return Promise.resolve();
    if (sleepTimerUntil.current && Date.now() >= sleepTimerUntil.current) return Promise.resolve();
    const automaticCount = queueRef.current.autoUpcoming.length;
    if (!refresh && automaticCount >= 3) return Promise.resolve();
    if (autoFill.current) return autoFill.current;
    const session = autoSession.current;
    setIsPreparingAuto(true);
    const work = (async () => {
      try {
        const [recentIds, suppressedIds] = await Promise.all([getRecentTrackIds(12), getSuppressedTrackIds()]);
        if (session !== autoSession.current) return;
        const replaceableIds = new Set(refresh ? queueRef.current.autoUpcoming.map((track) => track.id) : []);
        const retained = queueRef.current.items.filter((track) => !replaceableIds.has(track.id));
        const candidates = await autoManager.current.refill(
          new Set(retained.map((track) => track.id)),
          { ...signals(recentIds, suppressedIds), excludedSongKeys: new Set(retained.map(logicalSongKey)) },
          refresh ? 4 : 4 - queueRef.current.autoUpcoming.length
        );
        if (session !== autoSession.current || !LibraryService.getSettings().autoplayRelated || stopAtEndRef.current) return;
        if (sleepTimerUntil.current && Date.now() >= sleepTimerUntil.current) return;
        if (refresh && candidates.length) {
          queueRef.current.replaceAutoUpcoming(candidates);
          bumpQueue();
          persistQueue();
          preloader.schedule(queueRef.current.peekNext());
        } else if (queueRef.current.add(candidates)) {
          bumpQueue();
          persistQueue();
          preloader.schedule(queueRef.current.peekNext());
        }
      } finally {
        if (session === autoSession.current) setIsPreparingAuto(false);
      }
    })().catch(() => undefined).finally(() => { if (autoFill.current === work) autoFill.current = null; });
    autoFill.current = work;
    return work;
  }, [bumpQueue, persistQueue, signals]);

  const refreshAuto = useCallback(() => {
    const session = autoSession.current;
    const current = autoFill.current;
    if (current) {
      // In-flight discovery reads the latest session signals when it ranks.
      if (queueRef.current.autoUpcoming.length === 0) return;
      void current.finally(() => {
        if (session === autoSession.current) void fillAuto(true);
      });
    } else void fillAuto(true);
  }, [fillAuto]);

  useEffect(() => {
    lastLikedSignature.current = LibraryService.getLiked().map((track) => track.id).sort().join('|');
    return LibraryService.subscribe(() => {
      const likedSignature = LibraryService.getLiked().map((track) => track.id).sort().join('|');
      if (lastLikedSignature.current !== null && likedSignature !== lastLikedSignature.current) refreshAuto();
      lastLikedSignature.current = likedSignature;
      const enabled = LibraryService.getSettings().autoplayRelated;
      if (lastAutoEnabled.current === enabled) return;
      lastAutoEnabled.current = enabled;
      if (!enabled) {
        autoManager.current.cancel();
        autoFill.current = null;
        queueRef.current.clearAutoUpcoming();
        bumpQueue();
        persistQueue();
        preloader.schedule(queueRef.current.peekNext());
      } else void fillAuto();
    });
  }, [bumpQueue, fillAuto, persistQueue, refreshAuto]);

  // ---- loading a track --------------------------------------------------

  const loadCurrent = useCallback(
    async (options: { autoPlay?: boolean; startPosition?: number; intentAt?: number } = {}) => {
      const track = queueRef.current.current;
      if (!track) {
        failureActive.current = false;
        loadAbort.current?.abort();
        activeTiming.current?.finish('superseded');
        activeTiming.current = null;
        loadingTrackId.current = null;
        transition.current.reset();
        clearFeedbackTimers();
        clearBufferingTimers();
        setTransitionState('idle');
        setTransitionFeedback('hidden');
        setPendingTrack(null);
        transitioning.current = false;
        setCurrentTrack(null);
        setIsLoading(false);
        playbackEngine.stop();
        return;
      }

      const id = transition.current.begin(track.id);
      if (id === null) return; // repeated tap on the same resolving selection
      failureActive.current = false;
      clearBufferingTimers();
      loadId.current = id;
      transitioning.current = true;
      activeTiming.current?.finish('superseded');

      // Only abort the previous load if it was for a DIFFERENT track. Aborting
      // a load of this same track would kill the shared in-flight resolve that
      // this load is about to join (double-tap on a row does exactly that).
      if (loadingTrackId.current !== track.id) {
        loadAbort.current?.abort();
      }

      const controller = new AbortController();
      loadAbort.current = controller;
      loadingTrackId.current = track.id;

      const preloadedThis = preloader.pending === track.id || Boolean(streamResolver.peek(track));
      const timing = new PlaybackTiming(preloadedThis, Date.now, options.intentAt);
      activeTiming.current = timing;
      timing.mark('resolverStart');
      startFeedbackTimers(id);
      setTransitionState('resolving');

      // Stop warming anything that is no longer next -- but if we were warming
      // THIS track, adopt that request instead of aborting it: resolveStream
      // below will be handed the very same in-flight promise.
      preloader.adopt(track.id);

      if (__DEV__) {
        console.log('[playback] load', track.title, '| preloaded:', preloadedThis);
      }

      // Keep the confirmed native track visible while the next stream resolves.
      playbackEngine.pause();
      setStatus((previous) => ({ ...previous, isPlaying: false, isBuffering: true }));
      setPendingTrack(track);
      setError(null);
      setIsLoading(true);
      lastAttempt.current = { track, position: options.startPosition ?? 0 };

      try {
        const stream = await MusicService.resolveStream(track, controller.signal);
        if (!transition.current.isCurrent(id)) return; // superseded by a newer load
        timing.mark('resolverComplete');
        transition.current.advance(id, 'preparing');
        setTransitionState('preparing');

        await playbackEngine.load(track, stream, {
          autoPlay: options.autoPlay,
          startPosition: options.startPosition,
          isCurrent: () => transition.current.isCurrent(id),
          onMilestone: (stage) => {
            if (!transition.current.isCurrent(id)) return;
            timing.mark(stage);
            if (stage === 'nativeLoadStart' || stage === 'nativeReady') {
              transition.current.advance(id, 'buffering');
              setTransitionState('buffering');
            }
          },
        });
        if (!transition.current.isCurrent(id)) return;

        timing.finish('playing');
        activeTiming.current = null;
        clearFeedbackTimers();
        transition.current.advance(id, options.autoPlay === false ? 'paused' : 'playing');
        setTransitionState(options.autoPlay === false ? 'paused' : 'playing');
        setTransitionFeedback('hidden');
        setCurrentTrack(track);
        confirmedTrack.current = track;
        transitioning.current = false;
        setStatus(playbackEngine.getStatus());
        historyWrittenFor.current = null;
        setPendingTrack(null);
        setIsLoading(false);
        autoSkips.current = 0;
        loadingTrackId.current = null;
        if (__DEV__) console.log('[playback] started', track.title);
        LibraryService.recordPlay(track);

        if (autoManager.current.seedId !== track.id) {
          autoSession.current++;
          autoFill.current = null;
          autoManager.current.advance(track);
        }

        // Warm exactly one track ahead, so pressing skip is instant.
        preloader.schedule(queueRef.current.peekNext());
        if (refreshAfterNext.current) {
          refreshAfterNext.current = false;
          void fillAuto(true);
        } else void fillAuto();
      } catch (e) {
        if (!transition.current.isCurrent(id)) return;

        // Always leave the loading state, whatever went wrong.
        timing.finish('failed');
        activeTiming.current = null;
        clearFeedbackTimers();
        transitioning.current = false;
        setStatus({ ...playbackEngine.getStatus(), isBuffering: false, isPlaying: false });
        setIsLoading(false);
        loadingTrackId.current = null;
        const err = toAppError(e, 'playback_failed');
        if (__DEV__) console.log('[playback] FAILED', track.title, '|', err.kind, '|', err.detail ?? '');

        // A dead stream URL should not be reused on retry.
        if (err.kind !== 'network' && err.kind !== 'timeout') {
          MusicService.invalidateStream(track);
        }

        // A track that simply cannot play should not strand the queue: step
        // over it and keep going. Network failures are NOT skipped -- the
        // next track would fail identically, so the error is shown instead.
        if (shouldSkipFailedCandidate(
          err.kind, Boolean(track.isAutoSuggested), queueRef.current.hasNext,
          autoSkips.current, MAX_AUTO_SKIPS
        )) {
          autoSkips.current += 1;
          if (__DEV__) console.log('[playback] auto-skip', autoSkips.current, 'past', track.title);
          queueRef.current.next(false);
          bumpQueue();
          persistQueue();
          void loadCurrent({ autoPlay: true, intentAt: options.intentAt });
          return;
        }

        autoSkips.current = 0;
        failureActive.current = true;
        transition.current.advance(id, 'failed');
        setTransitionState('failed');
        setTransitionFeedback('failed');
        setError(messageFor(err));
      }
    },
    [bumpQueue, persistQueue, fillAuto, clearFeedbackTimers, clearBufferingTimers, startFeedbackTimers]
  );

  // ---- engine wiring ----------------------------------------------------

  useEffect(() => {
    playbackEngine.on('onStatus', (s) => {
      statusRef.current = s;
      if (!transitioning.current) {
        setStatus(s);
        if (!failureActive.current) {
          setTransitionState(s.isPlaying ? 'playing' : s.isBuffering ? 'buffering' : s.isLoaded ? 'paused' : 'idle');
        }
        if (!failureActive.current && s.isBuffering && !s.isPlaying && bufferingSince.current === null) {
          bufferingSince.current = Date.now();
          bufferingTimers.current = [
            setTimeout(() => {
              if (bufferingSince.current !== null && !transitioning.current) {
                setTransitionFeedback('preparing');
              }
            }, PREPARING_FEEDBACK_MS),
            setTimeout(() => {
              if (bufferingSince.current !== null && !transitioning.current) {
                setTransitionFeedback('long');
              }
            }, LONG_WAIT_FEEDBACK_MS),
          ];
        } else if ((!s.isBuffering || s.isPlaying) && bufferingSince.current !== null) {
          clearBufferingTimers();
          setTransitionFeedback('hidden');
        }
      }
    });

    playbackEngine.on('onComplete', () => {
      if (transitioning.current) return;
      if (sleepTimerUntil.current && Date.now() >= sleepTimerUntil.current) return;
      // `auto` so repeat-one replays rather than advances.
      const nextTrack = queueRef.current.next(true);
      bumpQueue();
      persistQueue();

      if (!nextTrack) {
        const completedId = queueRef.current.current?.id;
        const session = autoSession.current;
        void fillAuto().then(() => {
          if (session !== autoSession.current || queueRef.current.current?.id !== completedId) return;
          if (stopAtEndRef.current || (sleepTimerUntil.current && Date.now() >= sleepTimerUntil.current)) return;
          if (queueRef.current.next(true)) {
            bumpQueue();
            persistQueue();
            void loadCurrent({ autoPlay: true });
          }
        });
        return;
      }
      void loadCurrent({ autoPlay: true });
    });

    playbackEngine.on('onError', (e) => {
      if (transitioning.current) return;
      clearBufferingTimers();
      failureActive.current = true;
      setIsLoading(false);
      setTransitionState('failed');
      setTransitionFeedback('failed');
      setPendingTrack(confirmedTrack.current);
      setError(messageFor(e instanceof AppError ? e : toAppError(e, 'playback_failed')));
    });

    return () => {
      clearFeedbackTimers();
      clearBufferingTimers();
      activeTiming.current?.finish('superseded');
      transition.current.reset();
      preloader.cancel();
      void playbackEngine.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- startup: restore library, settings, queue and position -----------

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await Promise.all([MusicService.init(), LibraryService.load()]);
        if (cancelled) return;

        const settings = LibraryService.getSettings();
        lastAutoEnabled.current = settings.autoplayRelated;
        endpointSource.setEndpoints(settings.resolverEndpoints);

        playbackEngine.setVolume(settings.volume);
        setVolumeState(settings.volume);
        void playbackEngine.configure();

        const snapshot = await readJson<QueueSnapshot>(STORAGE_KEYS.queue, EMPTY_QUEUE);
        if (cancelled) return;

        if (snapshot.tracks?.length) {
          queueRef.current.restore(snapshot);
          bumpQueue();

          const restored = queueRef.current.current;
          if (restored) {
            // Restore the track and its position, but never auto-play on
            // launch -- starting audio unprompted is hostile.
            const saved = await LibraryService.getSavedPlayback();
            if (cancelled) return;

            setCurrentTrack(restored);
            setTransitionState('paused');
            confirmedTrack.current = restored;
            lastAttempt.current = {
              track: restored,
              position: saved.trackId === restored.id ? saved.position : 0,
            };
          }
        }
      } catch {
        // A corrupt restore must never prevent the app from starting.
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- persist playback position ---------------------------------------

  // Position ticks ~4x a second but is persisted in whole seconds, so only
  // react when the second actually changes.
  const positionSecond = Math.floor(status.position);

  useEffect(() => {
    if (!currentTrack || playbackEngine.trackId !== currentTrack.id || !status.isPlaying) return;
    LibraryService.savePlayback(currentTrack.id, positionSecond);

    // A listen is logged once, mid-playback, not on tap and not on finish --
    // so skipping away early leaves no trace, and a track abandoned near the
    // end still counts.
    if (historyWrittenFor.current === loadId.current) return;

    const trackDuration = status.duration || currentTrack.duration || 0;

    const threshold = Math.min(
      HISTORY_MIN_SECONDS,
      trackDuration > 0 ? trackDuration * HISTORY_MIN_RATIO : HISTORY_MIN_SECONDS
    );

    if (positionSecond >= threshold && positionSecond > 0) {
      historyWrittenFor.current = loadId.current;
      LibraryService.recordListen(currentTrack);
      if (__DEV__) console.log('[history] logged', currentTrack.title);
    }
  }, [currentTrack, positionSecond, status.duration]);

  // Flush pending writes when the app goes to the background or the tab closes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') void flushWrites();
    });

    let onHide: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onHide = () => void flushWrites();
      window.addEventListener('pagehide', onHide);
    }

    return () => {
      sub.remove();
      if (onHide && typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onHide);
      }
    };
  }, []);

  // ---- actions ----------------------------------------------------------

  const playTrack = useCallback(
    (track: Track, context?: { tracks?: Track[]; label?: string; candidates?: Track[]; query?: string }) => {
      if (transitioning.current && loadingTrackId.current === track.id) return;
      nextIntent.current++;
      refreshAfterNext.current = false;
      const intentAt = Date.now();
      autoSession.current++;
      autoFill.current = null;
      autoManager.current.start(track, context?.candidates, context?.query);
      const list = context?.tracks?.length ? context.tracks : [track];
      const startIndex = Math.max(
        0,
        list.findIndex((t) => t.id === track.id)
      );

      queueRef.current.setTracks(list, startIndex, context?.label ?? '');
      if (LibraryService.getSettings().autoplayRelated && !stopAtEndRef.current) {
        queueRef.current.add(autoManager.current.immediate(
          new Set(queueRef.current.items.map((item) => item.id)),
          { ...signals(), excludedSongKeys: new Set(queueRef.current.items.map(logicalSongKey)) }
        ));
      }
      bumpQueue();
      persistQueue();

      void loadCurrent({ autoPlay: true, intentAt });
      void fillAuto();
    },
    [bumpQueue, fillAuto, loadCurrent, persistQueue, signals]
  );

  const togglePlayPause = useCallback(() => {
    if (transitioning.current) return;
    const track = queueRef.current.current ?? currentTrack;
    if (!track) return;

    // Restored-but-never-loaded track: the first press starts it.
    if (playbackEngine.trackId !== track.id) {
      if (!queueRef.current.current) {
        queueRef.current.setTracks([track], 0, '');
        bumpQueue();
      }
      void loadCurrent({
        autoPlay: true,
        startPosition: lastAttempt.current?.position ?? 0,
      });
      return;
    }

    if (status.isPlaying) playbackEngine.pause();
    else playbackEngine.play();
  }, [bumpQueue, currentTrack, loadCurrent, status.isPlaying]);

  const next = useCallback(async () => {
    const intent = ++nextIntent.current;
    const intentAt = Date.now();
    if (!transitioning.current && statusRef.current.isPlaying && statusRef.current.position < 10 && confirmedTrack.current) {
      sessionSkippedIds.current.add(confirmedTrack.current.id);
      autoManager.current.noteSkip(confirmedTrack.current);
      refreshAfterNext.current = true;
    }
    const session = autoSession.current;
    if (!queueRef.current.peekNext() && !queueRef.current.hasNext) await fillAuto();
    if (session !== autoSession.current || intent !== nextIntent.current) return;
    const nextTrack = queueRef.current.next(false);
    bumpQueue();
    persistQueue();

    if (!nextTrack) {
      refreshAfterNext.current = false;
      return;
    }
    // Consecutive presses in one JS turn coalesce into the latest selection.
    Promise.resolve().then(() => {
      if (intent === nextIntent.current) void loadCurrent({ autoPlay: true, intentAt });
    });
  }, [bumpQueue, fillAuto, loadCurrent, persistQueue]);

  const previous = useCallback(() => {
    nextIntent.current++;
    if (transitioning.current) {
      const previousTrack = queueRef.current.previous();
      if (previousTrack) {
        bumpQueue();
        persistQueue();
        void loadCurrent({ autoPlay: true, intentAt: Date.now() });
      }
      return;
    }
    // Standard behaviour: restart the track if we are more than 3s in.
    if (statusRef.current.position > 3) {
      void playbackEngine.seekTo(0);
      return;
    }

    const prevTrack = queueRef.current.previous();
    bumpQueue();
    persistQueue();

    if (!prevTrack) {
      // First track, no repeat: just restart from the beginning.
      void playbackEngine.seekTo(0);
      return;
    }
    void loadCurrent({ autoPlay: true });
  }, [bumpQueue, loadCurrent, persistQueue]);

  useEffect(() => {
    playbackEngine.on('onNext', () => { void next(); });
    playbackEngine.on('onPrevious', previous);
  }, [next, previous]);

  const seekTo = useCallback((seconds: number) => {
    void playbackEngine.seekTo(seconds);
  }, []);

  /**
   * Relative seek, matching the +/-10s the lock screen offers.
   * Clamped to the track so it cannot run past either end.
   */
  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const { duration, position } = statusRef.current;
      const total = duration || currentTrack?.duration || 0;
      const target = position + deltaSeconds;
      const clamped = total > 0 ? Math.min(total, Math.max(0, target)) : Math.max(0, target);
      void playbackEngine.seekTo(clamped);
    },
    [currentTrack?.duration]
  );

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    playbackEngine.setVolume(clamped);
    setVolumeState(clamped);
    LibraryService.updateSettings({ volume: clamped });
  }, []);

  const setSleepTimer = useCallback((minutes: number | null) => {
    const wasStopping = stopAtEndRef.current;
    sleepTimerUntil.current = minutes === null ? null : Date.now() + minutes * 60000;
    stopAtEndRef.current = false;
    setStopAtEndState(false);
    playbackEngine.setSleepTimer(minutes);
    if (wasStopping) void fillAuto();
  }, [fillAuto]);

  const setStopAtEndOfQueue = useCallback((enabled: boolean) => {
    stopAtEndRef.current = enabled;
    setStopAtEndState(enabled);
    if (enabled) {
      autoManager.current.cancel();
      autoFill.current = null;
      queueRef.current.clearAutoUpcoming();
      bumpQueue();
      persistQueue();
      preloader.schedule(queueRef.current.peekNext());
    } else void fillAuto();
  }, [bumpQueue, fillAuto, persistQueue]);

  const retry = useCallback(() => {
    const attempt = lastAttempt.current;
    if (!attempt) return;

    nextIntent.current++;
    setError(null);
    MusicService.invalidateStream(attempt.track);
    void loadCurrent({ autoPlay: true, startPosition: attempt.position });
  }, [loadCurrent]);

  const clearError = useCallback(() => {
    failureActive.current = false;
    setError(null);
    setTransitionFeedback('hidden');
    setPendingTrack(null);
    setTransitionState(playbackEngine.getStatus().isPlaying ? 'playing' : 'paused');
  }, []);

  // ---- queue operations -------------------------------------------------

  const addToQueue = useCallback(
    (tracks: Track | Track[]) => {
      const wasEmpty = queueRef.current.length === 0;
      const manual = (Array.isArray(tracks) ? tracks : [tracks]).map((track) =>
        track.isAutoSuggested ? { ...track, isAutoSuggested: false } : track
      );
      const added = queueRef.current.add(manual);
      if (!added) return false;
      autoManager.current.noteManual(manual);
      bumpQueue();
      persistQueue();

      if (wasEmpty) void loadCurrent({ autoPlay: true });
      else preloader.schedule(queueRef.current.peekNext());
      if (!wasEmpty) refreshAuto();
      return true;
    },
    [bumpQueue, loadCurrent, persistQueue, refreshAuto]
  );

  const playNextInQueue = useCallback(
    (tracks: Track | Track[]) => {
      const wasEmpty = queueRef.current.length === 0;
      const manual = (Array.isArray(tracks) ? tracks : [tracks]).map((track) =>
        track.isAutoSuggested ? { ...track, isAutoSuggested: false } : track
      );
      queueRef.current.playNext(manual);
      autoManager.current.noteManual(manual);
      bumpQueue();
      persistQueue();

      if (wasEmpty) void loadCurrent({ autoPlay: true });
      else preloader.schedule(queueRef.current.peekNext());
      if (!wasEmpty) refreshAuto();
    },
    [bumpQueue, loadCurrent, persistQueue, refreshAuto]
  );

  const removeFromQueue = useCallback(
    (trackId: string) => {
      const removedAuto = queueRef.current.autoUpcoming.find((track) => track.id === trackId);
      if (removedAuto) autoManager.current.noteSkip(removedAuto);
      const removedCurrent = queueRef.current.remove(trackId);
      bumpQueue();
      persistQueue();

      // Removing the playing track slides the next one into its place.
      if (removedCurrent) {
        if (queueRef.current.current) void loadCurrent({ autoPlay: true });
        else void loadCurrent();
      } else if (removedAuto) refreshAuto();
    },
    [bumpQueue, loadCurrent, persistQueue, refreshAuto]
  );

  const reorderQueue = useCallback(
    (from: number, to: number) => {
      // UI indices are relative to `upcoming` (starts after the current track).
      // Queue.reorder expects indices into the full `order` array, so we offset
      // by (total - upcoming.length) which equals (position + 1).
      const upcomingLen = queueRef.current.upcoming.length;
      const totalLen = queueRef.current.length;
      const offset = totalLen - upcomingLen;
      queueRef.current.reorder(from + offset, to + offset);
      bumpQueue();
      persistQueue();
    },
    [bumpQueue, persistQueue]
  );

  const clearQueue = useCallback(() => {
    queueRef.current.clearManualUpcoming();
    bumpQueue();
    persistQueue();
    preloader.schedule(queueRef.current.peekNext());
  }, [bumpQueue, persistQueue]);

  const jumpTo = useCallback(
    (trackId: string) => {
      const track = queueRef.current.jumpTo(trackId);
      if (!track) return;

      nextIntent.current++;
      bumpQueue();
      persistQueue();
      void loadCurrent({ autoPlay: true });
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const toggleShuffle = useCallback(() => {
    queueRef.current.toggleShuffle();
    bumpQueue();
    persistQueue();
    preloader.schedule(queueRef.current.peekNext());
  }, [bumpQueue, persistQueue]);

  const cycleRepeat = useCallback(() => {
    queueRef.current.cycleRepeat();
    bumpQueue();
    persistQueue();
  }, [bumpQueue, persistQueue]);

  // ---- context values ---------------------------------------------------

  const queueSnapshot = useMemo(
    () => ({
      items: queueRef.current.items,
      upcoming: queueRef.current.upcoming,
      upcomingEntries: queueRef.current.upcomingEntries,
      manualUpcoming: queueRef.current.manualUpcoming,
      contextUpcoming: queueRef.current.contextUpcoming,
      autoUpcoming: queueRef.current.autoUpcoming,
      context: queueRef.current.context,
      isPreparingAuto,
      pendingTrack,
      shuffle: queueRef.current.shuffle,
      repeat: queueRef.current.repeat,
      hasNext: queueRef.current.hasNext,
      hasPrevious: queueRef.current.hasPrevious,
    }),
    // queueVersion is the explicit invalidation signal for the mutable Queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueVersion, isPreparingAuto, pendingTrack]
  );

  // Prefer the source-reported duration, falling back to provider metadata
  // so the scrubber is usable before the stream reports one.
  const duration = status.duration || currentTrack?.duration || 0;

  const value = useMemo<PlayerContextType>(
    () => ({
      currentTrack,
      isPlaying: status.isPlaying,
      playTrack,
      togglePlayPause,

      isLoading,
      isBuffering: status.isBuffering,
      error,
      clearError,
      retry,

      duration,
      volume,
      setVolume,
      sleepTimerExpiration: status.sleepTimerExpiration || null,
      setSleepTimer,
      stopAtEndOfQueue,
      setStopAtEndOfQueue,
      seekTo,
      seekBy,

      next,
      previous,
      hasNext: queueSnapshot.hasNext,
      hasPrevious: queueSnapshot.hasPrevious,

      queue: queueSnapshot.items,
      upcoming: queueSnapshot.upcoming,
      upcomingEntries: queueSnapshot.upcomingEntries,
      manualUpcoming: queueSnapshot.manualUpcoming,
      contextUpcoming: queueSnapshot.contextUpcoming,
      autoUpcoming: queueSnapshot.autoUpcoming,
      queueContext: queueSnapshot.context,
      isPreparingAuto: queueSnapshot.isPreparingAuto,
      pendingTrack: queueSnapshot.pendingTrack,
      transitionState,
      transitionFeedback,
      addToQueue,
      playNext: playNextInQueue,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      jumpTo,

      shuffle: queueSnapshot.shuffle,
      toggleShuffle,
      repeat: queueSnapshot.repeat,
      cycleRepeat,

      isReady,
      canPlayCurrent: currentTrack ? MusicService.canPlay(currentTrack) : false,
    }),
    [
      currentTrack,
      status.isPlaying,
      status.isBuffering,
      playTrack,
      togglePlayPause,
      isLoading,
      error,
      clearError,
      retry,
      duration,
      volume,
      setVolume,
      status.sleepTimerExpiration,
      setSleepTimer,
      stopAtEndOfQueue,
      setStopAtEndOfQueue,
      seekTo,
      seekBy,
      next,
      previous,
      queueSnapshot,
      transitionState,
      transitionFeedback,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      jumpTo,
      toggleShuffle,
      cycleRepeat,
      isReady,
    ]
  );

  const progressValue = useMemo(
    () => ({ position: status.position, duration }),
    [status.position, duration]
  );

  return (
    <PlayerContext.Provider value={value}>
      <ProgressContext.Provider value={progressValue}>{children}</ProgressContext.Provider>
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};

/** Subscribe to playback position without re-rendering on every other change. */
export const useProgress = () => useContext(ProgressContext);

