import * as MediaLibrary from 'expo-media-library';
import { ProviderId, ResolvedStream, Track, SearchResults, trackKey, emptySearchResults } from '../../core/types';
import { TrackResolver, PlaylistPage } from '../TrackResolver';

export const localResolver: TrackResolver = {
  id: 'local',
  name: 'Local Storage',

  async search(query: string): Promise<SearchResults> {
    return emptySearchResults(query);
  },

  async resolve(track: Track): Promise<ResolvedStream> {
    return { url: track.audioUrl || '', mimeType: 'audio/mpeg', expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 365, resolvedBy: 'local' };
  },

  async getMetadata(sourceId: string): Promise<Track> {
    throw new Error('Not implemented');
  },

  async getPlaylist(browseId: string): Promise<PlaylistPage> {
    throw new Error('Not implemented');
  },
};

export async function fetchLocalTracks(): Promise<Track[]> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') return [];

  const media = await MediaLibrary.getAssetsAsync({
    mediaType: 'audio',
    first: 1000,
  });

  return media.assets.map(asset => ({
    id: trackKey('local', asset.id),
    provider: 'local',
    sourceId: asset.id,
    title: asset.filename.replace(/\.[^/.]+$/, ""), // remove extension
    artist: { id: 'local-artist', name: 'Local Music', provider: 'local' as ProviderId, browseId: 'local-artist', imageUrl: '' },
    albumImageUrl: 'local_music_icon', 
    duration: Math.floor(asset.duration),
    audioUrl: asset.uri,
    createdAt: asset.creationTime,
    updatedAt: asset.modificationTime,
  }));
}
