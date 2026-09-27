import { describe, expect, it } from 'vitest';
import { Track } from '../../core/types';
import { DownloadManager, DownloadFiles, DownloadSource } from '../DownloadManager';
import { OfflineLibrary, OfflinePersistence } from '../OfflineLibrary';
import { OfflineMediaService } from '../OfflineMediaService';
import { DownloadRecord } from '../types';

const track = (id: string): Track => ({ id, provider: 'youtube', sourceId: id,
  title: `Song ${id}`, artist: { id: 'artist', name: 'Artist' }, albumImageUrl: '', duration: 180 });

function setup(options: { unsupported?: string[]; fail?: string[]; concurrency?: number } = {}) {
  let saved: DownloadRecord[] = [];
  const persistence: OfflinePersistence = {
    read: async () => saved,
    write: async (records) => { saved = structuredClone(records); return true; },
  };
  const filesOnDevice = new Set<string>();
  const library = new OfflineLibrary(persistence);
  const source: DownloadSource = {
    capability: (item) => options.unsupported?.includes(item.id) ? 'STREAMING_ONLY' : 'AUTHORIZED_DOWNLOAD',
    authorizedAsset: async () => ({ url: 'https://licensed.example/audio', extension: 'm4a' }),
  };
  let active = 0, maxActive = 0;
  const files: DownloadFiles = {
    exists: async (uri) => filesOnDevice.has(uri),
    remove: async (uri) => { filesOnDevice.delete(uri); },
    onWifi: async () => true,
    transfer: async (item, _asset, progress, signal) => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        if (signal.aborted) throw new Error('cancelled');
        if (options.fail?.includes(item.id)) throw new Error('test transfer failure');
        progress(100, 100);
        const uri = `file:///private/${item.id}.m4a`;
        filesOnDevice.add(uri);
        return { localUri: uri, fileSize: 100 };
      } finally { active--; }
    },
  };
  const manager = new DownloadManager(source, library, files, () => false, options.concurrency ?? 3);
  return { manager, library, files, persistence, getSaved: () => saved, getMaxActive: () => maxActive };
}

describe('authorized offline media', () => {
  it('downloads one eligible track and persists its validated local metadata', async () => {
    const { manager, library, files, persistence } = setup();
    await library.init(files.exists);
    const summary = await manager.download([track('A')]);
    expect(summary).toMatchObject({ total: 1, completed: 1, streamingOnly: 0, failed: 0 });
    expect(library.get('A')).toMatchObject({ localUri: 'file:///private/A.m4a', fileSize: 100, status: 'completed' });
    const restored = new OfflineLibrary(persistence);
    await restored.init(files.exists);
    expect(restored.get('A')?.status).toBe('completed');
  });

  it('keeps unsupported tracks streaming-only and bulk failures isolated', async () => {
    const { manager, library, files } = setup({ unsupported: ['U'], fail: ['F'] });
    await library.init(files.exists);
    const summary = await manager.download([track('A'), track('U'), track('F'), track('B')]);
    expect(summary).toMatchObject({ total: 4, eligible: 3, completed: 2, failed: 1, streamingOnly: 1 });
    expect(library.get('U')).toBeUndefined();
    expect(library.get('F')?.status).toBe('failed');
    expect(library.get('B')?.status).toBe('completed');
  });

  it('bounds 100-track bulk concurrency and stores one file per stable ID', async () => {
    const { manager, library, files, getMaxActive } = setup({ concurrency: 3 });
    await library.init(files.exists);
    const tracks = Array.from({ length: 100 }, (_, index) => track(String(index)));
    const summary = await manager.download([...tracks, tracks[0], tracks[1]]);
    expect(summary.total).toBe(100);
    expect(summary.completed).toBe(100);
    expect(getMaxActive()).toBeLessThanOrEqual(3);
    expect(library.completed()).toHaveLength(100);
    expect((await manager.download([tracks[0]])).alreadyAvailable).toBe(1);
  });

  it('does not accept an interrupted or missing file as completed', async () => {
    const { library, files, persistence } = setup();
    await library.init(files.exists);
    await library.set({ trackId: 'A', source: 'youtube', status: 'downloading' });
    await library.set({ trackId: 'B', source: 'youtube', status: 'completed', localUri: 'file:///private/missing.m4a', fileSize: 100 });
    const restored = new OfflineLibrary(persistence);
    await restored.init(files.exists);
    expect(restored.get('A')?.status).toBe('failed');
    expect(restored.get('B')?.status).toBe('failed');
  });

  it('reacquires an interrupted authorized asset after restart without persisting its URL', async () => {
    const { library, files, persistence } = setup();
    await library.init(files.exists);
    await library.set({ trackId: 'A', source: 'youtube', title: 'Song A', track: track('A'), status: 'queued' });
    const restored = new OfflineLibrary(persistence);
    await restored.init(files.exists);
    const source: DownloadSource = {
      capability: () => 'AUTHORIZED_DOWNLOAD',
      authorizedAsset: async () => ({ url: 'https://licensed.example/fresh-grant', extension: 'm4a' }),
    };
    const manager = new DownloadManager(source, restored, files, () => false);
    await manager.recoverInterrupted();
    expect(restored.get('A')?.status).toBe('completed');
    expect(JSON.stringify(await persistence.read())).not.toContain('fresh-grant');
  });

  it('cancels queued bulk work without marking partial files complete', async () => {
    const { manager, library, files } = setup({ concurrency: 1 });
    await library.init(files.exists);
    const work = manager.download([track('A'), track('B'), track('C')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await manager.cancelAll();
    const summary = await work;
    expect(summary.completed + summary.cancelled + summary.failed).toBe(3);
    expect(library.all().filter((record) => record.status === 'completed').every((record) => Boolean(record.localUri))).toBe(true);
  });

  it('respects Wi-Fi only before starting an eligible download', async () => {
    const { library, files } = setup();
    await library.init(files.exists);
    const source: DownloadSource = { capability: () => 'AUTHORIZED_DOWNLOAD', authorizedAsset: async () => ({ url: 'https://licensed.example/a', extension: 'm4a' }) };
    const transfer = { ...files, onWifi: async () => false };
    const manager = new DownloadManager(source, library, transfer, () => true);
    await expect(manager.download([track('A')])).rejects.toThrow('Wi-Fi');
    expect(library.get('A')).toBeUndefined();
  });

  it('offline mode accepts device-local media but rejects streaming-only tracks', async () => {
    const { library, files } = setup();
    await library.init(files.exists);
    const service = new OfflineMediaService(library, files);
    const local: Track = { ...track('local:A'), provider: 'local', sourceId: 'asset-A' };
    expect(service.capability(local)).toBe('LOCAL');
    expect(service.capability(track('online'))).toBe('STREAMING_ONLY');
    expect(service.isAvailable(local)).toBe(true);
    expect(service.isAvailable(track('online'))).toBe(false);
    await expect(service.localStream(track('online'), true)).rejects.toThrow('Streaming only');
    expect(await service.localStream(local, true)).toBeNull(); // local resolver owns its URI
  });

  it('removing an offline copy changes only download metadata/files', async () => {
    const { manager, library, files } = setup();
    await library.init(files.exists);
    const liked = [track('A')];
    const playlist = { tracks: [track('A')] };
    await manager.download([liked[0]]);
    const service = new OfflineMediaService(library, files);
    expect(await service.remove('A')).toBe(true);
    expect(library.get('A')).toBeUndefined();
    expect(liked).toHaveLength(1);
    expect(playlist.tracks).toHaveLength(1);
  });
});
