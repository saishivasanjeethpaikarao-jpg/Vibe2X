import { Playlist, PlaylistImportProvider, Track } from '../../core/types';

export type ParsedPlaylistUrl = {
  source: PlaylistImportProvider;
  playlistId: string;
  canonicalUrl: string;
};

export type SourceTrack = {
  /** Stable per source row, so repeated songs retain their original order. */
  key: string;
  sourceId: string;
  position: number;
  title: string;
  artists: string[];
  album?: string;
  duration: number;
  sourceUrl?: string;
  playableTrack?: Track;
};

export type SourcePlaylist = {
  source: PlaylistImportProvider;
  sourcePlaylistId: string;
  sourcePlaylistUrl: string;
  name: string;
  description: string;
  creator: string;
  tracks: SourceTrack[];
  unavailableCount: number;
  duplicateCount: number;
  declaredTrackCount?: number;
};

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH';

export type MatchCandidate = {
  track: Track;
  score: number;
  confidence: Exclude<MatchConfidence, 'NO_MATCH'>;
  reasons: string[];
};

export type SpotifyTrackMatch = {
  source: SourceTrack;
  confidence: MatchConfidence;
  alternatives: MatchCandidate[];
  /** HIGH matches are preselected; all others require an explicit review choice. */
  selectedTrack: Track | null;
  reviewed: boolean;
};

export type ImportProgress =
  | { phase: 'fetching'; loaded: number; total?: number }
  | { phase: 'matching'; completed: number; total: number };

export type ImportCollision = {
  sameSource: Playlist | null;
  sameName: Playlist | null;
  suggestedName: string;
};

export type PreparedImport = {
  playlist: SourcePlaylist;
  tracks: Track[];
  automaticallyMatched: number;
  reviewedMatches: number;
  needsReview: number;
  unavailableCount: number;
  duplicateCount: number;
};

export type PlaylistSourceClient = {
  fetchPlaylist(
    parsed: ParsedPlaylistUrl,
    signal: AbortSignal,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SourcePlaylist>;
};
