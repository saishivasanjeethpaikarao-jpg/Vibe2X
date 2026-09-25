import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { Playlist, Track } from '../core/types';
import { MusicPreferences } from '../core/musicPreferences';
import { endpointSource } from '../providers/stream/StreamResolver';
import {
  AppSettings,
  HistoryEntry,
  LibraryService,
  UserProfile,
} from '../services/LibraryService';

type LibraryContextType = {
  liked: Track[];
  playlists: Playlist[];
  recentlyPlayed: Track[];
  /** Listening log, newest first. */
  history: HistoryEntry[];
  clearHistory: () => void;
  /** Mark a playlist as recently accessed, so it sorts to the top. */
  touchPlaylist: (playlistId: string) => void;
  settings: AppSettings;
  isLoaded: boolean;

  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => void;

  createPlaylist: (name: string, tracks?: Track[]) => Playlist;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  togglePinPlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, tracks: Track | Track[]) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  createImportedPlaylist: (
    name: string,
    tracks: Track[],
    source: NonNullable<Playlist['source']>,
    meta?: { description?: string; creator?: string; coverImageUrl?: string },
    options?: { allowSourceCopy?: boolean }
  ) => Playlist;

  updateSettings: (patch: Partial<AppSettings>) => void;
  saveMusicPreferences: (patch: Partial<MusicPreferences>) => Promise<MusicPreferences>;

  /** Local-only profile from Get Started. */
  profile: UserProfile;
  saveProfile: (patch: Partial<UserProfile>) => void;

  /** The synthetic "Liked Songs" playlist the UI shows alongside real ones. */
  likedPlaylist: Playlist;
};

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const LibraryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [liked, setLiked] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(LibraryService.getSettings());
  const [isLoaded, setIsLoaded] = useState(false);

  const sync = useCallback(() => {
    setLiked(LibraryService.getLiked());
    setPlaylists(LibraryService.getPlaylists());
    setRecentlyPlayed(LibraryService.getRecentlyPlayed());
    setHistory(LibraryService.getHistory());
    setSettings(LibraryService.getSettings());
  }, []);

  const touchPlaylist = useCallback(
    (playlistId: string) => {
      LibraryService.touchPlaylist(playlistId);
      sync();
    },
    [sync]
  );

  const clearHistory = useCallback(() => {
    LibraryService.clearHistory();
    sync();
  }, [sync]);

  const saveProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      LibraryService.saveProfile(patch);
      sync();
    },
    [sync]
  );

  // Playback writes recents and listening history directly on the service;
  // without this the History tab would only update after an app reload.
  useEffect(() => LibraryService.subscribe(sync), [sync]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await LibraryService.load();
      if (cancelled) return;

      sync();
      setIsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [sync]);

  /**
   * Recents are written by the player, not by this hook, so poll them while
   * the app is open. Cheap: it reads an in-memory array.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      const latest = LibraryService.getRecentlyPlayed();
      setRecentlyPlayed((prev) =>
        prev.length === latest.length && prev[0]?.id === latest[0]?.id ? prev : latest
      );
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  const isLiked = useCallback(
    (trackId: string) => liked.some((t) => t.id === trackId),
    [liked]
  );

  const toggleLike = useCallback(
    (track: Track) => {
      LibraryService.toggleLike(track);
      sync();
    },
    [sync]
  );

  const createPlaylist = useCallback(
    (name: string, tracks?: Track[]) => {
      const playlist = LibraryService.createPlaylist(name, { tracks });
      sync();
      return playlist;
    },
    [sync]
  );

  const deletePlaylist = useCallback(
    (id: string) => {
      LibraryService.deletePlaylist(id);
      sync();
    },
    [sync]
  );

  const togglePinPlaylist = useCallback(
    (id: string) => {
      LibraryService.togglePinPlaylist(id);
      sync();
    },
    [sync]
  );

  const renamePlaylist = useCallback(
    (id: string, name: string) => {
      LibraryService.updatePlaylist(id, { name });
      sync();
    },
    [sync]
  );

  const addToPlaylist = useCallback(
    (playlistId: string, tracks: Track | Track[]) => {
      LibraryService.addToPlaylist(playlistId, tracks);
      sync();
    },
    [sync]
  );

  const removeFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      LibraryService.removeFromPlaylist(playlistId, trackId);
      sync();
    },
    [sync]
  );

  const createImportedPlaylist = useCallback(
    (
      name: string,
      tracks: Track[],
      source: NonNullable<Playlist['source']>,
      meta: { description?: string; creator?: string; coverImageUrl?: string } = {},
      options: { allowSourceCopy?: boolean } = {}
    ) => {
      const playlist = LibraryService.createImportedPlaylist(name, tracks, source, meta, options);
      sync();
      return playlist;
    },
    [sync]
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    const updated = LibraryService.updateSettings(patch);
    setSettings(updated);

    // Endpoint changes must reach the resolver immediately.
    if (patch.resolverEndpoints) {
      endpointSource.setEndpoints(updated.resolverEndpoints);
    }
  }, []);
  const saveMusicPreferences = useCallback((patch: Partial<MusicPreferences>) => LibraryService.saveMusicPreferences(patch), []);

  /**
   * "Liked Songs" is presented as a playlist but is really the liked list, so
   * it is derived rather than stored twice.
   */
  const likedPlaylist = useMemo<Playlist>(
    () => ({
      id: 'liked',
      name: 'Liked Songs',
      description: 'The songs you love.',
      creator: 'You',
      coverImageUrl: 'liked_songs_gradient',
      tracks: liked,
      createdAt: 0,
      updatedAt: 0,
    }),
    [liked]
  );

  const value = useMemo<LibraryContextType>(
    () => ({
      liked,
      playlists,
      recentlyPlayed,
      history,
      clearHistory,
      touchPlaylist,
      settings,
      isLoaded,
      isLiked,
      toggleLike,
      createPlaylist,
      deletePlaylist,
      togglePinPlaylist,
      renamePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      createImportedPlaylist,
      updateSettings,
      saveMusicPreferences,

      profile: settings.profile,
      saveProfile,
      likedPlaylist,
    }),
    [
      liked,
      playlists,
      recentlyPlayed,
      history,
      clearHistory,
      touchPlaylist,
      settings,
      isLoaded,
      isLiked,
      toggleLike,
      createPlaylist,
      deletePlaylist,
      togglePinPlaylist,
      renamePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      createImportedPlaylist,
      updateSettings,
      saveMusicPreferences,
      saveProfile,
      likedPlaylist,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
};

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (context === undefined) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
};
