import { useEffect, useState } from 'react';
import { downloadManager } from '../offline/runtime';
import { offlineMediaService } from '../offline/runtime';

export function useOfflineDownloads(enabled = true) {
  const [records, setRecords] = useState(() => downloadManager.library.all());
  useEffect(() => {
    if (!enabled) return;
    setRecords(downloadManager.library.all());
    void offlineMediaService.init();
    return downloadManager.library.subscribe(() => setRecords(downloadManager.library.all()));
  }, [enabled]);
  return { records, completed: records.filter((record) => record.status === 'completed'),
    storageUsed: records.reduce((sum, record) => sum + (record.status === 'completed' ? record.fileSize ?? 0 : 0), 0) };
}
