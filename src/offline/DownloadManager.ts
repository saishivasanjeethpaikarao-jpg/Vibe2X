import { Track } from '../core/types';
import { OfflineLibrary } from './OfflineLibrary';
import { AuthorizedOfflineAsset, DownloadRecord, DownloadSummary, OfflineCapability } from './types';

export type DownloadSource = {
  capability(track: Track): OfflineCapability;
  authorizedAsset(track: Track, signal: AbortSignal): Promise<AuthorizedOfflineAsset>;
};

export type DownloadFiles = {
  exists(uri: string, size?: number): Promise<boolean>;
  transfer(track: Track, asset: AuthorizedOfflineAsset, onProgress: (written: number, total: number) => void, signal: AbortSignal): Promise<{ localUri: string; fileSize: number }>;
  remove(uri: string): Promise<void>;
  onWifi(): Promise<boolean>;
};

type Pending = {
  track: Track;
  resolve: (status: 'completed' | 'failed' | 'cancelled') => void;
  promise: Promise<'completed' | 'failed' | 'cancelled'>;
  controller: AbortController;
};

const RETRY_DELAYS = [0, 700, 1400];

/** Bounded shared worker queue. The service owns jobs; screens only request them. */
export class DownloadManager {
  private pending: Pending[] = [];
  private jobs = new Map<string, Pending>();
  private active = 0;
  private paused = false;
  private readonly concurrency: number;

  constructor(
    private source: DownloadSource,
    readonly library: OfflineLibrary,
    private files: DownloadFiles,
    private wifiOnly: () => boolean,
    concurrency = 3
  ) {
    this.concurrency = Math.max(1, Math.min(concurrency, 4));
  }

  /** Counts use unique stable track IDs, so a Liked/playlist overlap stores once. */
  preview(tracks: Track[]): Pick<DownloadSummary, 'total' | 'eligible' | 'alreadyAvailable' | 'streamingOnly'> {
    const unique = [...new Map(tracks.map((track) => [track.id, track])).values()];
    let eligible = 0, alreadyAvailable = 0, streamingOnly = 0;
    for (const track of unique) {
      const capability = this.source.capability(track);
      if (capability === 'LOCAL' || this.library.get(track.id)?.status === 'completed') alreadyAvailable++;
      else if (capability === 'AUTHORIZED_DOWNLOAD') eligible++;
      else streamingOnly++;
    }
    return { total: unique.length, eligible, alreadyAvailable, streamingOnly };
  }

  async download(tracks: Track[]): Promise<DownloadSummary> {
    const unique = [...new Map(tracks.map((track) => [track.id, track])).values()];
    const preview = this.preview(unique);
    if (preview.eligible > 0 && this.wifiOnly() && !await this.files.onWifi()) {
      throw new Error('Connect to Wi-Fi or turn off Wi-Fi only in Downloads & Storage.');
    }
    const eligible = unique.filter((track) => this.source.capability(track) === 'AUTHORIZED_DOWNLOAD' && this.library.get(track.id)?.status !== 'completed');
    const newJobs = eligible.filter((track) => !this.jobs.has(track.id));
    if (newJobs.length) {
      const saved = await this.library.setMany(newJobs.map((track) => ({ trackId: track.id, title: track.title, track: { ...track, audioUrl: undefined }, source: track.provider, status: 'queued' })));
      if (!saved) {
        for (const track of newJobs) this.library.setTransient({ trackId: track.id, title: track.title, source: track.provider, status: 'failed', error: 'Could not save download queue' });
        throw new Error('Could not save download queue');
      }
    }
    const statuses = await Promise.all(eligible.map((track) => this.enqueue(track)));
    return {
      ...preview,
      completed: preview.alreadyAvailable + statuses.filter((status) => status === 'completed').length,
      failed: statuses.filter((status) => status === 'failed').length,
      cancelled: statuses.filter((status) => status === 'cancelled').length,
    };
  }

  /** Retry interrupted grants after restart; reacquire the asset, never persist its URL. */
  async recoverInterrupted(): Promise<void> {
    const interrupted = this.library.all().filter((record) =>
      record.status === 'failed' && record.error === 'Download interrupted' && record.track &&
      this.source.capability(record.track) === 'AUTHORIZED_DOWNLOAD'
    ).map((record) => record.track!);
    if (!interrupted.length) return;
    try { await this.download(interrupted); } catch { /* Retry stays available in Downloads & Storage. */ }
  }

  private enqueue(track: Track): Promise<'completed' | 'failed' | 'cancelled'> {
    const existing = this.jobs.get(track.id);
    if (existing) return existing.promise;
    let resolve!: Pending['resolve'];
    const promise = new Promise<'completed' | 'failed' | 'cancelled'>((done) => { resolve = done; });
    const job: Pending = { track, resolve, promise, controller: new AbortController() };
    this.jobs.set(track.id, job);
    this.pending.push(job);
    void this.pump();
    return promise;
  }

  private async pump(): Promise<void> {
    while (!this.paused && this.active < this.concurrency && this.pending.length) {
      const job = this.pending.shift()!;
      this.active++;
      void this.run(job).finally(() => {
        this.active--;
        this.jobs.delete(job.track.id);
        void this.pump();
      });
    }
  }

  private async run(job: Pending): Promise<void> {
    const { track, controller } = job;
    const startedAt = Date.now();
    let lastError: unknown;
    let lastProgressAt = 0;
    for (const delay of RETRY_DELAYS) {
      if (controller.signal.aborted) break;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (controller.signal.aborted) break;
      try {
        if (this.wifiOnly() && !await this.files.onWifi()) throw new Error('Wi-Fi connection lost');
        const asset = await this.source.authorizedAsset(track, controller.signal);
        if (controller.signal.aborted) break;
        const record: DownloadRecord = { trackId: track.id, title: track.title, track: { ...track, audioUrl: undefined }, source: track.provider, status: 'downloading' };
        this.library.setTransient(record);
        const result = await this.files.transfer(track, asset, (written, total) => {
          const now = Date.now();
          if (now - lastProgressAt >= 250 || (total > 0 && written >= total)) {
            lastProgressAt = now;
            this.library.setTransient({ ...record, bytesWritten: written, totalBytes: total });
          }
        }, controller.signal);
        if (controller.signal.aborted) {
          await this.files.remove(result.localUri);
          break;
        }
        const saved = await this.library.set({ ...record, status: 'completed', localUri: result.localUri,
          fileSize: result.fileSize, contentVersion: asset.contentVersion, checksum: asset.checksum,
          downloadedAt: Date.now(), bytesWritten: result.fileSize, totalBytes: result.fileSize });
        if (!saved) {
          await this.files.remove(result.localUri);
          throw new Error('Could not save offline metadata');
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[offline] completed', track.id, 'bytes', result.fileSize, 'ms', Date.now() - startedAt);
        job.resolve('completed');
        return;
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted) break;
      }
    }
    const status = controller.signal.aborted ? 'cancelled' : 'failed';
    const failureCode = lastError instanceof Error && /wi-fi/i.test(lastError.message) ? 'Wi-Fi unavailable'
      : lastError instanceof Error && /space|storage|disk full/i.test(lastError.message) ? 'Not enough storage'
        : 'Download failed';
    await this.library.set({ trackId: track.id, title: track.title, track: { ...track, audioUrl: undefined }, source: track.provider, status,
      error: status === 'failed' ? failureCode : undefined });
    job.resolve(status);
  }

  cancel(trackId: string): boolean {
    const job = this.jobs.get(trackId);
    if (!job) return false;
    job.controller.abort();
    const index = this.pending.indexOf(job);
    if (index >= 0) {
      this.pending.splice(index, 1);
      this.jobs.delete(trackId);
      void this.library.set({ trackId, title: job.track.title, track: { ...job.track, audioUrl: undefined }, source: job.track.provider, status: 'cancelled' })
        .finally(() => job.resolve('cancelled'));
    }
    return true;
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; void this.pump(); }
  async cancelAll(): Promise<void> {
    const jobs = [...this.jobs.values()];
    for (const job of jobs) this.cancel(job.track.id);
    await Promise.all(jobs.map((job) => job.promise));
  }
  get activeCount(): number { return this.active; }
  get queuedCount(): number { return this.pending.length; }
  get isPaused(): boolean { return this.paused; }
}
