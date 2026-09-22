import { MusicService } from '../../services/MusicService';
import { youtubeResolver } from '../../providers/youtube/YouTubeResolver';
import { PlaylistImportEngine } from './engine';
import { spotifyPlaylistSource } from './spotifySource';
import { YouTubePlaylistSource } from './youtubeSource';

const youtubePlaylistSource = new YouTubePlaylistSource(youtubeResolver);

export const playlistImportEngine = new PlaylistImportEngine({
  youtube: youtubePlaylistSource,
  spotify: spotifyPlaylistSource,
  searchTracks: async (query, signal) =>
    (await MusicService.search(query, { filter: 'Songs', limit: 8, signal })).tracks,
});
