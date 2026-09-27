import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { Track } from '../core/types';
import { AuthorizedOfflineAsset } from './types';

const ALLOWED_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg', 'flac', 'wav']);

/** App-private files only. No YouTube/stream resolver URL is accepted here. */
export class ExpoOfflineFiles {
  async exists(uri: string, expectedSize?: number): Promise<boolean> {
    try {
      const file = new File(uri);
      return file.exists && (file.size ?? 0) > 0 &&
        (expectedSize === undefined || file.size === expectedSize);
    } catch { return false; }
  }

  async remove(uri: string): Promise<void> {
    const root = new Directory(Paths.document, 'vibe2x-offline');
    if (!uri.startsWith(`${root.uri.replace(/\/$/, '')}/`)) return; // never delete library/device media
    const file = new File(uri);
    if (file.exists) file.delete();
  }

  async onWifi(): Promise<boolean> {
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.WIFI;
  }

  async transfer(
    track: Track,
    asset: AuthorizedOfflineAsset,
    onProgress: (written: number, total: number) => void,
    signal: AbortSignal
  ): Promise<{ localUri: string; fileSize: number }> {
    if (!/^https:\/\//i.test(asset.url)) throw new Error('Authorized asset must use HTTPS');
    const extension = asset.extension.toLowerCase().replace(/^\./, '');
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Unsupported offline audio format');
    const freeBytes = Paths.availableDiskSpace;
    if (asset.expectedBytes && Number.isFinite(freeBytes) && freeBytes > 0 && asset.expectedBytes + 10 * 1024 * 1024 > freeBytes) {
      throw new Error('Not enough storage');
    }

    const directory = new Directory(Paths.document, 'vibe2x-offline');
    directory.create({ idempotent: true, intermediates: true });
    const name = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, track.id);
    const temporary = new File(directory, `${name}.part`);
    const destination = new File(directory, `${name}.${extension}`);
    if (temporary.exists) temporary.delete();

    const task = File.createDownloadTask(asset.url, temporary, {
      headers: asset.headers,
      signal,
      onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes),
    });
    try {
      const result = await task.downloadAsync();
      if (!result || signal.aborted) throw new Error('Download interrupted');
      const size = result.size ?? 0;
      if (size <= 0 || (asset.expectedBytes !== undefined && size !== asset.expectedBytes)) {
        throw new Error('Downloaded file is incomplete');
      }
      if (asset.checksum?.startsWith('md5:')) {
        const actual = result.info({ md5: true }).md5;
        if (!actual || actual.toLowerCase() !== asset.checksum.slice(4).toLowerCase()) {
          throw new Error('Downloaded file checksum mismatch');
        }
      }
      if (destination.exists) destination.delete();
      result.move(destination);
      return { localUri: destination.uri, fileSize: size };
    } catch (error) {
      if (temporary.exists) temporary.delete();
      throw error;
    } finally {
      task.release();
    }
  }
}
