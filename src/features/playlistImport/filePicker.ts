import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { appErrorWithMessage } from '../../core/errors';
import { parsePlaylistFile } from './fileSource';
import { SourcePlaylist } from './types';

type Pick = typeof DocumentPicker.getDocumentAsync;
type Read = (uri: string) => Promise<string>;

/** System picker, then local-only read. A cancelled picker has no import side effects. */
export async function pickPlaylistFile(
  pick: Pick = DocumentPicker.getDocumentAsync,
  read: Read = (uri) => new File(uri).text()
): Promise<SourcePlaylist | null> {
  const result = await pick({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.size && asset.size > 5_000_000) {
    throw appErrorWithMessage('invalid_playlist', 'This playlist file is too large. Use an export smaller than 5 MB.');
  }
  let contents: string;
  try {
    contents = asset.file ? await asset.file.text() : await read(asset.uri);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[playlist-import] FILE_READ', error instanceof Error ? error.name : 'unknown');
    throw appErrorWithMessage('invalid_playlist', 'Could not read that file from your device. Download it locally and try again.');
  }
  try {
    const started = Date.now();
    const parsed = parsePlaylistFile(asset.name, contents, { mimeType: asset.mimeType });
    if ((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_IMPORT_QA_TIMING === '1') {
      console.info('[playlist-import] QA_PARSE', { elapsedMs: Date.now() - started, rows: parsed.tracks.length });
    }
    return parsed;
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[playlist-import] PARSE', error instanceof Error ? error.name : 'unknown');
    throw error;
  }
}
