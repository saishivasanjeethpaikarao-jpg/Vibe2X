import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, X, Trash2, Pin, Download } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Pill } from '../components/common/Pill';
import { GlassCard } from '../components/common/GlassCard';
import { TrackRow } from '../components/lists/TrackRow';
import { MusicService } from '../services/MusicService';
import { MiniPlayer } from '../components/player/MiniPlayer';
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

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SIZES.lg, paddingBottom: SIZES.bottomInset }
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Library</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setShowImport((v) => !v);
            }}
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
                placeholderTextColor={COLORS.text.muted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                onSubmitEditing={onCreatePlaylist}
                returnKeyType="done"
                maxLength={60}
              />
              <TouchableOpacity
                style={[
                  styles.importButton,
                  !newPlaylistName.trim() && styles.importButtonDisabled,
                ]}
                onPress={onCreatePlaylist}
                disabled={!newPlaylistName.trim()}
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
            {FILTERS.map(filter => (
              <Pill
                key={filter}
                label={filter}
                isActive={activeFilter === filter}
                onPress={() => setActiveFilter(filter)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.listContainer}>
          {activeFilter === 'Playlists' &&
            allPlaylists.map(playlist => (
              <View key={playlist.id}>
                <TouchableOpacity
                  style={styles.playlistRow}
                  activeOpacity={0.7}
                  onPress={() => openPlaylist(playlist)}
                  onLongPress={() => onPlayPlaylist(playlist)}
                >
                  {playlist.coverImageUrl && playlist.coverImageUrl !== 'liked_songs_gradient' ? (
                    <Image
                      source={{ uri: playlist.coverImageUrl }}
                      style={styles.playlistImage}
                    />
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
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {playlist.id !== 'liked' && (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => togglePinPlaylist(playlist.id)}
                      >
                        <Pin color={playlist.pinned ? COLORS.accent.magenta : COLORS.text.muted} size={18} />
                      </TouchableOpacity>
                    )}
                    {playlist.id !== 'liked' && (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => deletePlaylist(playlist.id)}
                      >
                        <Trash2 color={COLORS.text.muted} size={18} />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            ))}

          {activeFilter === 'Artists' &&
            (derived.artists.length ? (
              derived.artists.map(artist => (
                <View key={artist.name} style={styles.playlistRow}>
                  <Image source={{ uri: artist.image }} style={styles.artistImage} />
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistTitle}>{artist.name}</Text>
                    <Text style={styles.playlistSubtitle}>
                      Artist • {artist.count} {artist.count === 1 ? 'song' : 'songs'}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyHint}>Artists appear here as you save music.</Text>
            ))}

          {activeFilter === 'Albums' &&
            (derived.albums.length ? (
              derived.albums.map(album => (
                <View key={album.name} style={styles.playlistRow}>
                  <Image source={{ uri: album.image }} style={styles.playlistImage} />
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistTitle}>{album.name}</Text>
                    <Text style={styles.playlistSubtitle}>
                      Album • {album.artist}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyHint}>Albums appear here as you save music.</Text>
            ))}
          {activeFilter === 'Local Files' && (
            <View>
              <TouchableOpacity
                style={{ padding: 16, backgroundColor: '#333', borderRadius: 8, margin: 16, alignItems: 'center' }}
                onPress={scanLocalMusic}
              >
                <Text style={{ color: '#fff' }}>{isScanning ? 'Scanning...' : 'Scan Local Music'}</Text>
              </TouchableOpacity>
              {localTracks.length > 0 ? (
                localTracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    onPress={() => playTrack(track, { tracks: localTracks, label: 'Local Music' })}
                    isPlaying={currentTrack?.id === track.id && isPlaying}
                    
                    
                  />
                ))
              ) : (
                hasScanned ? <Text style={styles.emptyHint}>No local audio files found.</Text> : null
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <StatusBarScrim />

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
            isPlaying={isPlaying}
          
          isLoading={isLoading}
          onPlayPause={togglePlayPause}
          onNext={next}
          onPress={() => navigation.navigate('NowPlaying')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    fontFamily: FONTS.medium,
    fontSize: 28,
    color: COLORS.text.primary,
  },
  addButton: {
    padding: SIZES.sm,
  },
  filtersContainer: {
    marginBottom: SIZES.xl,
  },
  listContainer: {
    flex: 1,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.md,
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
    backgroundColor: '#8A2BE2', // Simple fallback for linear gradient
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
    padding: SIZES.sm,
  },
  expandedTracks: {
    marginBottom: SIZES.md,
  },
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.muted,
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
    height: 40,
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
    height: 40,
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

