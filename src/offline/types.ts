import { ProviderId, Track } from '../core/types';

export type OfflineCapability = 'LOCAL' | 'AUTHORIZED_DOWNLOAD' | 'CACHED_BY_PROVIDER' | 'STREAMING_ONLY';
export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

/** A provider-issued grant for persistent storage, never a playback stream URL. */
export type AuthorizedOfflineAsset = {
  url: string;
  extension: string;
  contentVersion?: string;
  expectedBytes?: number;
  checksum?: string;
  headers?: Record<string, string>;
};

export type DownloadRecord = {
  trackId: string;
  title?: string;
  track?: Track;
  source: ProviderId;
  status: DownloadStatus;
  localUri?: string;
  downloadedAt?: number;
  fileSize?: number;
  contentVersion?: string;
  checksum?: string;
  bytesWritten?: number;
  totalBytes?: number;
  error?: string;
};

export type DownloadSummary = {
  total: number;
  eligible: number;
  alreadyAvailable: number;
  streamingOnly: number;
  completed: number;
  failed: number;
  cancelled: number;
};

export type OfflineSource = {
  capability(track: Track): OfflineCapability;
  /** Only an authorized provider may issue this. It must not return a resolved streaming URL. */
  getAuthorizedAsset?(track: Track, signal: AbortSignal): Promise<AuthorizedOfflineAsset>;
  getCachedUri?(track: Track): Promise<string | null>;
};
