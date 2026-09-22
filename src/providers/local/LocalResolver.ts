import * as MediaLibrary from 'expo-media-library/legacy';
import { appError } from '../../core/errors';
import {
  ResolvedStream,
  Track,
  SearchResults,
  trackKey,
  emptySearchResults,
} from '../../core/types';
import { TrackResolver, PlaylistPage } from '../TrackResolver';

export const localResolver: TrackResolver = {
  id: 'local',
  name: 'Local Storage',

  async search(query: string): Promise<SearchResults> {
    return emptySearchResults(query);
  },

  async resolve(track: Track): Promise<ResolvedStream> {
    let url = track.audioUrl;

    // Library entries created by older builds may have had their local URI
    // stripped alongside expiring network stream URLs. Recover it from the
    // stable MediaLibrary asset id rather than handing expo-audio an empty URI.
    if (!url) {
      const asset = await MediaLibrary.getAssetInfoAsync(track.sourceId);
      url = asset.localUri ?? asset.uri;
    }

    if (!url) throw appError('track_unavailable', 'Local audio file is unavailable');

    return {
      url,
      mimeType: 'audio/mpeg',
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 365,
      resolvedBy: 'local',
    };
  },

  async getMetadata(_sourceId: string): Promise<Track> {
    throw new Error('Not implemented');
  },

  async getPlaylist(_browseId: string): Promise<PlaylistPage> {
    throw new Error('Not implemented');
  },
};

export async function fetchLocalTracks(): Promise<Track[]> {
  const { status } = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
  if (status !== 'granted') return [];

  const media = await MediaLibrary.getAssetsAsync({
    mediaType: 'audio',
    first: 1000,
  });

  return media.assets.map((asset) => ({
    id: trackKey('local', asset.id),
    provider: 'local',
    sourceId: asset.id,
    title: asset.filename.replace(/\.[^/.]+$/, ''),
    artist: { id: 'local-artist', name: 'Local Music', imageUrl: '' },
    albumImageUrl: '',
    duration: Math.floor(asset.duration),
    audioUrl: asset.uri,
  }));
}
