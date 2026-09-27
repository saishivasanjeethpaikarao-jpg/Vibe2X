import { appErrorWithMessage } from '../core/errors';
import { ResolvedStream, Track } from '../core/types';
import { providers } from '../providers/TrackResolver';
import { OfflineLibrary } from './OfflineLibrary';
import { AuthorizedOfflineAsset, OfflineCapability } from './types';

type OfflineFiles = { exists(uri: string, size?: number): Promise<boolean>; remove(uri: string): Promise<void> };

/** Provider capability is authoritative. A resolved playback URL is never a download grant. */
export class OfflineMediaService {
  constructor(readonly library: OfflineLibrary, readonly files: OfflineFiles) {}

  async init(): Promise<void> { await this.library.init((uri, size) => this.files.exists(uri, size)); }

  capability(track: Track): OfflineCapability {
    if (track.provider === 'local') return 'LOCAL';
    try {
      return providers.forTrack(track).offlineCapability?.(track) ?? 'STREAMING_ONLY';
    } catch {
      // A source that has not initialized cannot grant persistent storage.
      return 'STREAMING_ONLY';
    }
  }

  async authorizedAsset(track: Track, signal: AbortSignal): Promise<AuthorizedOfflineAsset> {
    if (this.capability(track) !== 'AUTHORIZED_DOWNLOAD') throw new Error('Streaming-only source');
    const provider = providers.forTrack(track);
    if (!provider.getAuthorizedOfflineAsset) throw new Error('No authorized offline asset');
    return provider.getAuthorizedOfflineAsset(track, signal);
  }

  isAvailable(track: Track): boolean {
    if (track.provider === 'local') return true;
    return this.library.get(track.id)?.status === 'completed';
  }

  /** Returns an app-private file without contacting any streaming provider. */
  async localStream(track: Track, offlineMode: boolean): Promise<ResolvedStream | null> {
    const record = this.library.get(track.id);
    if (record?.status === 'completed' && record.localUri) {
      if (await this.files.exists(record.localUri, record.fileSize)) {
        return { url: record.localUri, expiresAt: Number.MAX_SAFE_INTEGER, resolvedBy: 'offline' };
      }
      await this.library.set({ ...record, status: 'failed', localUri: undefined, error: 'Offline file missing or incomplete' });
    }
    if (offlineMode && track.provider !== 'local') {
      throw appErrorWithMessage('source_unavailable', 'Streaming only. Turn off Offline Mode to play this song.');
    }
    return null;
  }

  async remove(trackId: string): Promise<boolean> {
    const record = this.library.get(trackId);
    if (!record) return false;
    if (record.localUri) await this.files.remove(record.localUri);
    return this.library.delete(trackId);
  }

  async clear(): Promise<void> {
    for (const record of this.library.all()) await this.remove(record.trackId);
  }
}
