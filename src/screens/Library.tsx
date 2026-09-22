import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Plus, X, Trash2, Pin, Download } from 'lucide-react-native';
import { COLORS, SIZES, FONTS, THEME, TYPE } from '../constants/theme';
import { Pill } from '../components/common/Pill';
import { GlassCard } from '../components/common/GlassCard';
import { TrackRow } from '../components/lists/TrackRow';
import { MusicService } from '../services/MusicService';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { LikedSongsCover } from '../components/common/LikedSongsCover';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { Playlist, Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type LibraryStackParams = {
  Playlist: { playlistId: string };
  ImportPlaylist: { url?: string } | undefined;
  NowPlaying: undefined;
};
const SPOTIFY_LOGO = require('../../assets/spotify-full-logo-white.png');

const FILTERS = ['Playlists', 'Artists', 'Albums', 'Local Files'];

type LibraryItem =
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'artist'; artist: { name: string; image: string; count: number } }
  | { kind: 'album'; album: { name: string; artist: string; image: string; count: number } }
  | { kind: 'local'; track: Track }
  | { kind: 'scan' }
  | { kind: 'empty'; message: string };

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParams>>();
  const [activeFilter, setActiveFilter] = useState('Playlists');
  const { playTrack, currentTrack, isPlaying, togglePlayPause, isLoading, next } = usePlayer();
  const {
    playlists,
    likedPlaylist,
    liked,
    recentlyPlayed,
    deletePlaylist,
    togglePinPlaylist,
    touchPlaylist,
    createPlaylist,
  } = useLibrary();

  const [showImport, setShowImport] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const scanLocalMusic = async () => {
    setIsScanning(true);
    try {
      const tracks = await MusicService.getLocalTracks();
      setLocalTracks(tracks);
      setHasScanned(true);
    } catch (e) {
      console.warn(e);
    } finally {
      setIsScanning(false);
    }
  };
  /** Playlists have their own page, so a tap navigates rather than expanding. */
  const openPlaylist = useCallback(
    (playlist: Playlist) => {
      touchPlaylist(playlist.id);
      navigation.navigate('Playlist', { playlistId: playlist.id });
    },
    [navigation, touchPlaylist]
  );

  // "Liked Songs" always leads, then the user's own and imported playlists.
  const allPlaylists = useMemo<Playlist[]>(
    () => [
      likedPlaylist,
      // Pinned first, then most recently opened or changed
      ...[...playlists].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      }),
    ],
    [likedPlaylist, playlists]
  );

  /** Artists and albums are derived from what is actually in the library. */
  const derived = useMemo(() => {
    const tracks = [...liked, ...playlists.flatMap((p) => p.tracks), ...recentlyPlayed];

    const artists = new Map<string, { name: string; image: string; count: number }>();
    const albums = new Map<string, { name: string; artist: string; image: string; count: number }>();

    for (const t of tracks) {
      const a = artists.get(t.artist.name);
      if (a) a.count++;
      else artists.set(t.artist.name, { name: t.artist.name, image: t.albumImageUrl, count: 1 });

      if (t.album) {
        const al = albums.get(t.album);
        if (al) al.count++;
        else
          albums.set(t.album, {
            name: t.album,
            artist: t.artist.name,
            image: t.albumImageUrl,
            count: 1,
          });
      }
    }

    return {
      artists: [...artists.values()].sort((x, y) => y.count - x.count),
      albums: [...albums.values()].sort((x, y) => y.count - x.count),
    };
  }, [liked, playlists, recentlyPlayed]);


  const onPlayPlaylist = (playlist: Playlist) => {
    if (!playlist.tracks.length) return;
    playTrack(playlist.tracks[0], { tracks: playlist.tracks, label: playlist.name });
  };

  /** Create an empty playlist, then open its page so it can be filled. */
  const onCreatePlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;

    const playlist = createPlaylist(name);
    setNewPlaylistName('');
    setShowImport(false);
    Keyboard.dismiss();
    navigation.navigate('Playlist', { playlistId: playlist.id });
  };

  const libraryItems = useMemo<LibraryItem[]>(() => {
    switch (activeFilter) {
      case 'Playlists':
        return allPlaylists.map((playlist) => ({ kind: 'playlist', playlist }));
      case 'Artists':
        return derived.artists.length
          ? derived.artists.map((artist) => ({ kind: 'artist', artist }))
          : [{ kind: 'empty', message: 'Artists appear here as you save music.' }];
      case 'Albums':
        return derived.albums.length
          ? derived.albums.map((album) => ({ kind: 'album', album }))
          : [{ kind: 'empty', message: 'Albums appear here as you save music.' }];
      case 'Local Files':
        return [
          { kind: 'scan' },
          ...localTracks.map((track) => ({ kind: 'local' as const, track })),
          ...(hasScanned && localTracks.length === 0
            ? [{ kind: 'empty' as const, message: 'No local audio files found.' }]
            : []),
        ];
      default:
        return [];
    }
  }, [activeFilter, allPlaylists, derived.albums, derived.artists, hasScanned, localTracks]);

  return (
    <View style={styles.container}>
      <FlatList
        data={libraryItems}
        keyExtractor={(item, index) => {
          switch (item.kind) {
            case 'playlist': return `playlist:${item.playlist.id}`;
            case 'artist': return `artist:${item.artist.name}`;
            case 'album': return `album:${item.album.name}:${item.album.artist}`;
            case 'local': return `local:${item.track.id}:${index}`;
            case 'scan': return 'scan';
            case 'empty': return `empty:${activeFilter}`;
          }
        }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SIZES.lg, paddingBottom: SIZES.bottomInset }
        ]}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle} accessibilityRole="header">Your Library</Text>
                <Text style={styles.headerSubtitle}>Playlists, saved music, and local audio</Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowImport((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel={showImport ? 'Close playlist actions' : 'Create or import playlist'}
              >
                {showImport ? (
                  <X color={COLORS.text.primary} size={24} />
                ) : (
                  <Plus color={COLORS.text.primary} size={24} />
                )}
              </TouchableOpacity>
            </View>

            {showImport && (
              <GlassCard intensity={20} style={styles.importCard}>
                <Text style={styles.importTitle}>New playlist</Text>
                <View style={styles.importRow}>
                  <TextInput
                    style={styles.importInput}
                    placeholder="Playlist name"
                    placeholderTextColor={COLORS.text.secondary}
                    value={newPlaylistName}
                    onChangeText={setNewPlaylistName}
                    onSubmitEditing={onCreatePlaylist}
                    returnKeyType="done"
                    maxLength={60}
                    accessibilityLabel="New playlist name"
                  />
                  <TouchableOpacity
                    style={[
                      styles.importButton,
                      !newPlaylistName.trim() && styles.importButtonDisabled,
                    ]}
                    onPress={onCreatePlaylist}
                    disabled={!newPlaylistName.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="Create playlist"
                  >
                    <Text style={styles.importButtonText}>Create</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.panelDivider} />

                <TouchableOpacity
                  style={styles.importAction}
                  onPress={() => {
                    setShowImport(false);
                    navigation.navigate('ImportPlaylist');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Import playlist from YouTube or Spotify"
                >
                  <Download color={COLORS.text.primary} size={20} />
                  <View style={styles.importActionCopy}>
                    <Text style={styles.importActionTitle}>Import Playlist</Text>
                    <Text style={styles.importActionSubtitle}>YouTube, YouTube Music, or Spotify</Text>
                  </View>
                </TouchableOpacity>
              </GlassCard>
            )}

            <View style={styles.filtersContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {FILTERS.map((filter) => (
                  <Pill
                    key={filter}
                    label={filter}
                    isActive={activeFilter === filter}
                    onPress={() => setActiveFilter(filter)}
                  />
                ))}
              </ScrollView>
            </View>
          </>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'playlist') {
            const playlist = item.playlist;
            return (
              <TouchableOpacity
                style={styles.playlistRow}
                activeOpacity={0.7}
                onPress={() => openPlaylist(playlist)}
                onLongPress={() => onPlayPlaylist(playlist)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${playlist.name}, ${playlist.tracks.length} tracks`}
                accessibilityHint="Long press to play"
              >
                {playlist.id === 'liked' ? (
                  <LikedSongsCover size={64} empty={playlist.tracks.length === 0} style={styles.playlistImage} />
                ) : playlist.coverImageUrl && playlist.coverImageUrl !== 'liked_songs_gradient' ? (
                  <Image source={{ uri: playlist.coverImageUrl }} style={styles.playlistImage} />
                ) : (
                  <View style={[styles.playlistImage, styles.likedSongsGradient]} />
                )}
                <View style={styles.playlistInfo}>
                  <Text style={styles.playlistTitle} numberOfLines={1}>{playlist.name}</Text>
                  {playlist.source?.provider === 'spotify' ? (
                    <View style={styles.spotifyAttribution}>
                      <Text style={styles.playlistSubtitle}>Playlist • {playlist.tracks.length}</Text>
                      <Image source={SPOTIFY_LOGO} style={styles.spotifyLogo} resizeMode="contain" />
                    </View>
                  ) : (
                    <Text style={styles.playlistSubtitle}>
                      {playlist.id === 'liked'
                        ? `${playlist.tracks.length} songs`
                        : `Playlist • ${playlist.creator} • ${playlist.tracks.length}`}
                    </Text>
                  )}
                </View>
                {playlist.id !== 'liked' && (
                  <View style={styles.playlistActions}>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => togglePinPlaylist(playlist.id)}
                      accessibilityRole="button"
                      accessibilityLabel={playlist.pinned ? `Unpin ${playlist.name}` : `Pin ${playlist.name}`}
                    >
                      <Pin color={playlist.pinned ? COLORS.accent.magenta : COLORS.text.muted} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deletePlaylist(playlist.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${playlist.name}`}
                    >
                      <Trash2 color={COLORS.text.muted} size={18} />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          }

          if (item.kind === 'artist') {
            const artist = item.artist;
            return (
              <View style={styles.playlistRow}>
                <Image source={{ uri: artist.image }} style={styles.artistImage} />
                <View style={styles.playlistInfo}>
                  <Text style={styles.playlistTitle}>{artist.name}</Text>
                  <Text style={styles.playlistSubtitle}>
                    Artist • {artist.count} {artist.count === 1 ? 'song' : 'songs'}
                  </Text>
                </View>
              </View>
            );
          }

          if (item.kind === 'album') {
            const album = item.album;
            return (
              <View style={styles.playlistRow}>
                <Image source={{ uri: album.image }} style={styles.playlistImage} />
                <View style={styles.playlistInfo}>
                  <Text style={styles.playlistTitle}>{album.name}</Text>
                  <Text style={styles.playlistSubtitle}>Album • {album.artist}</Text>
                </View>
              </View>
            );
          }

          if (item.kind === 'local') {
            return (
              <TrackRow
                track={item.track}
                onPress={() => playTrack(item.track, { tracks: localTracks, label: 'Local Music' })}
                isPlaying={currentTrack?.id === item.track.id && isPlaying}
              />
            );
          }

          if (item.kind === 'scan') {
            return (
              <TouchableOpacity
                style={styles.scanButton}
                onPress={scanLocalMusic}
                accessibilityRole="button"
                accessibilityLabel={isScanning ? 'Scanning local music' : 'Scan local music'}
              >
                <Text style={styles.scanButtonText}>{isScanning ? 'Scanning…' : 'Scan local music'}</Text>
              </TouchableOpacity>
            );
          }

          return <Text style={styles.emptyHint}>{item.message}</Text>;
        }}
      />

      <StatusBarScrim />

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
            isPlaying={isPlaying}
          
          isLoading={isLoading}
          onPlayPause={togglePlayPause}
          onNext={next}
          onPress={() => navigation.navigate('NowPlaying')}
          tabBarHeight={tabBarHeight}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background.primary,
  },
  scrollContent: {
    paddingHorizontal: SIZES.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  headerTitle: {
    ...TYPE.display,
    fontFamily: FONTS.bold,
    color: THEME.text.primary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: THEME.text.secondary,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface.interactive,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
  },
  filtersContainer: {
    marginBottom: SIZES.xl,
  },
  playlistActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.md,
    minHeight: 76,
    paddingVertical: SIZES.xs,
  },
  playlistImage: {
    width: 64,
    height: 64,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  artistImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceLight,
  },
  likedSongsGradient: {
    backgroundColor: THEME.accent.primary,
  },
  playlistInfo: {
    flex: 1,
    marginLeft: SIZES.md,
    justifyContent: 'center',
  },
  playlistTitle: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  playlistSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  deleteButton: {
    width: SIZES.touchTarget,
    height: SIZES.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedTracks: {
    marginBottom: SIZES.md,
  },
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
  },
  importCard: {
    padding: SIZES.md,
    marginBottom: SIZES.md,
  },
  importTitle: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
    marginBottom: SIZES.sm,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  importInput: {
    flex: 1,
    height: SIZES.touchTarget,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.primary,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.sm,
  },
  importButton: {
    marginLeft: SIZES.sm,
    height: SIZES.touchTarget,
    minWidth: 56,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  panelDivider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginVertical: SIZES.md,
  },
  scanButton: {
    minHeight: 52,
    marginVertical: SIZES.md,
    borderRadius: SIZES.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface.interactive,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
  },
  scanButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: THEME.text.primary,
  },
  spotifyAttribution: {
    alignItems: 'flex-start',
    gap: 2,
  },
  spotifyLogo: {
    width: 70,
    height: 20,
  },
  importAction: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
  },
  importActionCopy: {
    flex: 1,
  },
  importActionTitle: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  importActionSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  importButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.background,
  },
});

