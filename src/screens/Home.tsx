import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Compass, Heart, Moon, Search, Target, User } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { TrackRow } from '../components/lists/TrackRow';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { GlassSurface } from '../components/liquid/GlassSurface';
import { PressableScale } from '../components/liquid/PressableScale';
import { SectionHeader } from '../components/liquid/SectionHeader';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { COLORS, FONTS, SIZES, THEME, TYPE } from '../constants/theme';
import { Track } from '../core/types';
import { FEATURED_QUERY, randomQueryFor } from '../data/catalog';
import { useLibrary } from '../hooks/useLibrary';
import { usePlayer } from '../hooks/usePlayer';
import { MusicService } from '../services/MusicService';
import { useSnackbar } from '../components/common/SnackbarContext';
import { greetingForHour } from '../core/greeting';

const LOGO = require('../../assets/icon.png');

const ACTIONS = [
  { id: 'liked', label: 'Liked', Icon: Heart, query: null },
  { id: 'discover', label: 'Discover', Icon: Compass, query: 'discover new music' },
  { id: 'chill', label: 'Chill', Icon: Moon, query: 'chill relaxing songs' },
  { id: 'focus', label: 'Focus', Icon: Target, query: 'focus instrumental concentration' },
] as const;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    playTrack,
    next,
    addToQueue,
  } = usePlayer();
  const { recentlyPlayed, playlists, profile } = useLibrary();
  const { show: showSnackbar } = useSnackbar();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [starter, setStarter] = useState<Track[]>([]);
  const [starterError, setStarterError] = useState(false);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());

  useFocusEffect(useCallback(() => {
    const update = () => setLocalHour(new Date().getHours());
    update();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => subscription.remove();
  }, []));

  const hasRecents = recentlyPlayed.length > 0;
  const pinnedPlaylists = useMemo(
    () => playlists.filter((playlist) => playlist.pinned).slice(0, 6),
    [playlists]
  );

  useEffect(() => {
    let cancelled = false;
    void MusicService.search(FEATURED_QUERY, { limit: 8 })
      .then((results) => {
        if (cancelled) return;
        setStarter(results.tracks.slice(0, 4));
        setStarterError(false);
      })
      .catch(() => {
        if (!cancelled) setStarterError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runAction = useCallback(
    async (action: (typeof ACTIONS)[number]) => {
      const query = randomQueryFor(action.id) ?? action.query;
      if (query === null) {
        (navigation as any).navigate('Playlist', { playlistId: 'liked' });
        return;
      }
      setPendingAction(action.id);
      try {
        const results = await MusicService.search(query, { limit: 25 });
        if (!results.tracks.length) {
          showSnackbar(`No ${action.label.toLowerCase()} tracks found`);
          return;
        }
        const shuffled = [...results.tracks];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        playTrack(shuffled[0], { tracks: shuffled, label: action.label });
      } catch {
        showSnackbar('Could not load music. Try again.');
      } finally {
        setPendingAction(null);
      }
    },
    [navigation, playTrack, showSnackbar]
  );

  const listTracks = useMemo(
    () => (hasRecents ? recentlyPlayed.slice(0, 4) : starter),
    [hasRecents, recentlyPlayed, starter]
  );

  const handleTrackPress = useCallback(
    (track: Track) => {
      playTrack(track, {
        tracks: listTracks,
        label: hasRecents ? 'Recently Played' : 'Start Listening',
      });
    },
    [hasRecents, listTracks, playTrack]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.md }]}>
        <View style={styles.brandRow}>
          <Image source={LOGO} style={styles.brandMark} accessibilityIgnoresInvertColors />
          <Text style={styles.brandName}>Vibe2X</Text>
        </View>
        <TouchableOpacity
          style={styles.avatar}
          onPress={() => navigation.navigate('Settings' as never)}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <User color={THEME.text.secondary} size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: SIZES.bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>{greetingForHour(localHour)}</Text>
          {!!profile.name && <Text style={styles.name}>{profile.name}</Text>}
        </View>

        <PressableScale
          onPress={() => navigation.navigate('SearchTab' as never)}
          accessibilityRole="button"
          accessibilityLabel="Search music"
          contentStyle={styles.searchBar}
        >
          <Search color={THEME.text.secondary} size={20} />
          <Text style={styles.searchText}>Songs, artists, albums, playlists</Text>
        </PressableScale>

        <SectionHeader title="Find your next vibe" />
        <View style={styles.actionsRow}>
          {ACTIONS.map((action) => (
            <PressableScale
              key={action.id}
              style={styles.actionTouchable}
              contentStyle={styles.actionContent}
              onPress={() => runAction(action)}
              accessibilityRole="button"
              accessibilityLabel={`${action.label} music`}
            >
              <View style={styles.actionIcon}>
                {pendingAction === action.id ? (
                  <ActivityIndicator size="small" color={THEME.text.primary} />
                ) : (
                  <action.Icon color={THEME.text.primary} size={19} />
                )}
              </View>
              <Text style={styles.actionText}>{action.label}</Text>
            </PressableScale>
          ))}
        </View>

        {pinnedPlaylists.length > 0 && (
          <>
            <SectionHeader
              title="Pinned playlists"
              actionLabel="Open Library"
              onAction={() => navigation.navigate('LibraryTab' as never)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pinnedRow}
            >
              {pinnedPlaylists.map((playlist) => (
                <PressableScale
                  key={playlist.id}
                  style={styles.pinnedItem}
                  onPress={() =>
                    (navigation as any).navigate('Playlist', { playlistId: playlist.id })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${playlist.name}`}
                >
                  {playlist.coverImageUrl && playlist.coverImageUrl !== 'liked_songs_gradient' ? (
                    <Image source={{ uri: playlist.coverImageUrl }} style={styles.pinnedArtwork} />
                  ) : (
                    <View style={[styles.pinnedArtwork, styles.pinnedFallback]} />
                  )}
                  <Text style={styles.pinnedTitle} numberOfLines={1}>{playlist.name}</Text>
                  <Text style={styles.pinnedMeta}>{playlist.tracks.length} tracks</Text>
                </PressableScale>
              ))}
            </ScrollView>
          </>
        )}

        <SectionHeader
          title={hasRecents ? 'Recently played' : 'Start listening'}
          actionLabel={hasRecents ? 'See history' : 'Search'}
          onAction={() => navigation.navigate((hasRecents ? 'HistoryTab' : 'SearchTab') as never)}
        />

        <View style={styles.listContainer}>
          {listTracks.length ? (
            listTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                onPress={handleTrackPress}
                onMorePress={setAddingTrack}
                onSwipeRight={addToQueue}
                isPlaying={currentTrack?.id === track.id && isPlaying}
              />
            ))
          ) : (
            <GlassSurface strength="soft" style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {starterError ? 'Music is unavailable right now' : 'Loading music'}
              </Text>
              <Text style={styles.emptyCopy}>
                {starterError ? 'Check your connection or use Search to try again.' : 'Finding real tracks from the current provider.'}
              </Text>
            </GlassSurface>
          )}
        </View>
      </ScrollView>

      <StatusBarScrim />
      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />
      <MiniPlayer
        track={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={togglePlayPause}
        onNext={next}
        onPress={() => navigation.navigate('NowPlaying' as never)}
        tabBarHeight={tabBarHeight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background.primary },
  header: {
    minHeight: 76,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.background.primary,
    zIndex: 20,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 34, height: 34, borderRadius: 9, marginRight: SIZES.sm },
  brandName: { fontFamily: FONTS.bold, fontSize: 20, color: THEME.text.primary, letterSpacing: -0.4 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.surface.interactive,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingHorizontal: SIZES.md },
  greetingBlock: { marginTop: SIZES.md, marginBottom: SIZES.lg },
  greeting: { ...TYPE.body, fontFamily: FONTS.regular, color: THEME.text.secondary },
  name: { ...TYPE.display, fontFamily: FONTS.bold, color: THEME.text.primary, marginTop: 2 },
  searchBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.md,
    backgroundColor: THEME.surface.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
  },
  searchText: { flex: 1, marginLeft: SIZES.sm, fontFamily: FONTS.regular, fontSize: 15, color: THEME.text.secondary },
  actionsRow: { flexDirection: 'row', gap: SIZES.sm },
  actionTouchable: { flex: 1 },
  actionContent: {
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radius.md,
    backgroundColor: THEME.surface.interactive,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.subtle,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SIZES.xs,
    backgroundColor: THEME.surface.selected,
  },
  actionText: { fontFamily: FONTS.medium, fontSize: 11, color: THEME.text.secondary },
  pinnedRow: { paddingRight: SIZES.md },
  pinnedItem: { width: 132, marginRight: SIZES.md },
  pinnedArtwork: { width: 132, height: 132, borderRadius: SIZES.radius.md, backgroundColor: THEME.surface.interactive },
  pinnedFallback: { backgroundColor: THEME.accent.softPrimary },
  pinnedTitle: { marginTop: SIZES.sm, fontFamily: FONTS.medium, fontSize: 14, color: THEME.text.primary },
  pinnedMeta: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: THEME.text.secondary },
  listContainer: { marginBottom: SIZES.xl },
  emptyState: { padding: SIZES.md, borderRadius: SIZES.radius.md },
  emptyTitle: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.primary },
  emptyCopy: { marginTop: SIZES.xs, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: THEME.text.secondary },
});
