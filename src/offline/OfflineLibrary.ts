import { readJson, STORAGE_KEYS, writeJson } from '../core/storage';
import { DownloadRecord } from './types';

export type OfflinePersistence = {
  read(): Promise<DownloadRecord[]>;
  write(records: DownloadRecord[]): Promise<boolean>;
};

const nativePersistence: OfflinePersistence = {
  read: () => readJson<DownloadRecord[]>(STORAGE_KEYS.offlineDownloads, []),
  write: (records) => writeJson(STORAGE_KEYS.offlineDownloads, records),
};

/** Persistent metadata only. A completed record is trusted only after file validation. */
export class OfflineLibrary {
  private records = new Map<string, DownloadRecord>();
  private listeners = new Set<() => void>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private pendingWrite: Promise<boolean> = Promise.resolve(true);

  constructor(private persistence: OfflinePersistence = nativePersistence) {}

  init(exists: (uri: string, size?: number) => Promise<boolean>): Promise<void> {
    if (!this.initPromise) this.initPromise = this.load(exists);
    return this.initPromise;
  }

  private async load(exists: (uri: string, size?: number) => Promise<boolean>): Promise<void> {
    if (this.initialized) return;
    const saved = await this.persistence.read();
    for (const record of Array.isArray(saved) ? saved : []) {
      if (!record?.trackId || !record?.source) continue;
      if (record.status === 'completed') {
        if (!record.localUri || !await exists(record.localUri, record.fileSize)) {
          this.records.set(record.trackId, { ...record, status: 'failed', localUri: undefined, error: 'Offline file missing or incomplete' });
          continue;
        }
      }
      // No secret-bearing remote URL or native task is persisted. Interrupted
      // transfers restart from a fresh provider grant when the user retries.
      this.records.set(record.trackId, record.status === 'downloading' || record.status === 'queued'
        ? { ...record, status: 'failed', error: 'Download interrupted' }
        : record);
    }
    this.initialized = true;
    await this.persist();
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void { for (const listener of this.listeners) listener(); }

  get(trackId: string): DownloadRecord | undefined { return this.records.get(trackId); }
  all(): DownloadRecord[] { return [...this.records.values()]; }
  completed(): DownloadRecord[] { return this.all().filter((record) => record.status === 'completed'); }
  storageUsed(): number { return this.completed().reduce((sum, record) => sum + (record.fileSize ?? 0), 0); }

  async set(record: DownloadRecord): Promise<boolean> {
    this.records.set(record.trackId, record);
    this.emit();
    return this.persist();
  }

  setTransient(record: DownloadRecord): void {
    this.records.set(record.trackId, record);
    this.emit();
  }

  async setMany(records: DownloadRecord[]): Promise<boolean> {
    for (const record of records) this.records.set(record.trackId, record);
    this.emit();
    return this.persist();
  }

  async delete(trackId: string): Promise<boolean> {
    this.records.delete(trackId);
    this.emit();
    return this.persist();
  }

  private persist(): Promise<boolean> {
    const snapshot = this.all();
    this.pendingWrite = this.pendingWrite.catch(() => false).then(() => this.persistence.write(snapshot));
    return this.pendingWrite;
  }
}
