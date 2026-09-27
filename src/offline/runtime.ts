import { LibraryService } from '../services/LibraryService';
import { DownloadManager } from './DownloadManager';
import { OfflineMediaService } from './OfflineMediaService';
import { OfflineLibrary } from './OfflineLibrary';
import { ExpoOfflineFiles } from './ExpoOfflineFiles';

const files = new ExpoOfflineFiles();
export const offlineMediaService = new OfflineMediaService(new OfflineLibrary(), files);

/** One shared manager across all screens, so overlapping bulk jobs coalesce. */
export const downloadManager = new DownloadManager(
  offlineMediaService,
  offlineMediaService.library,
  files,
  () => LibraryService.getSettings().wifiOnlyDownloads
);
