import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SectionList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Search as SearchIcon, X, Clock3 } from 'lucide-react-native';
import { COLORS, SIZES, FONTS, THEME, TYPE } from '../constants/theme';
import { Pill } from '../components/common/Pill';
import { GlassCard } from '../components/common/GlassCard';
import { TrackRow } from '../components/lists/TrackRow';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { BROWSE_CATEGORIES } from '../data/catalog';
import { SearchFilter, Track } from '../core/types';
import { useSearch } from '../hooks/useSearch';
import { usePlayer } from '../hooks/usePlayer';
import { MusicService } from '../services/MusicService';
import { LibraryService } from '../services/LibraryService';
import { singleSearchTrackContext } from './searchPlayback';
import { useNavigation } from '@react-navigation/native';

const FILTERS: SearchFilter[] = ['All', 'Songs', 'Artists', 'Albums', 'Playlists'];

type SearchSectionKind = 'track' | 'artist' | 'album' | 'playlist';
type SearchListItem = { key: string; track: Track };
type SearchSection = {
  title: string;
  kind: SearchSectionKind;
  data: SearchListItem[];
};

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    isSearching,
    error,
    searchNow,
    retry,
    clear,
    hasResults,
  } = useSearch();

  const { playTrack, currentTrack, isPlaying, togglePlayPause, next, addToQueue } = usePlayer();
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const sync = () => { if (active) setRecentQueries(LibraryService.getSearchHistory()); };
    const unsubscribe = LibraryService.subscribe(sync);
    void LibraryService.load().then(sync).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);

  const isBrowsing = query.trim().length === 0;

  /** Playing a single search result starts only that track — no hidden queue. */
  const onPlayTrack = useCallback(
    (track: Track) => {
      // The result has been chosen; the user is done typing.
      Keyboard.dismiss();
      playTrack(track, {
        ...singleSearchTrackContext(track, results.query),
        candidates: results.tracks.filter((item) => item.id !== track.id),
        query: results.query,
      });
    },
    [playTrack, results.query, results.tracks]
  );

  /** Tapping an album/playlist expands it and plays it as a queue. */
  const onOpenCollection = useCallback(
    async (
      id: string,
      browseId: string,
      name: string,
      kind: 'album' | 'playlist'
    ) => {
      Keyboard.dismiss();
      setExpandingId(id);
    try {
      const page =
        kind === 'album'
          ? await MusicService.getAlbum(browseId)
          : await MusicService.getPlaylist(browseId);

      if (page.tracks.length) {
        playTrack(page.tracks[0], { tracks: page.tracks, label: name });
      }
    } catch {
      // The inline error row below already covers failed lookups.
      } finally {
        setExpandingId(null);
      }
    },
    [playTrack]
  );

  const onOpenArtist = useCallback(
    async (id: string, browseId: string, name: string) => {
      Keyboard.dismiss();
      setExpandingId(id);
    try {
      const tracks = await MusicService.getArtistTracks(browseId);
      if (tracks.length) playTrack(tracks[0], { tracks, label: name });
      } catch {
        /* handled by the error row */
      } finally {
        setExpandingId(null);
      }
    },
    [playTrack]
  );

  // Synthetic Track objects for non-track results. Memoized because a new
  // object literal per render would defeat TrackRow’s memoization.
  const artistRows = useMemo(
    () =>
      results.artists.map((artist) => ({
        id: artist.id,
        title: artist.name,
        artist: { id: artist.id, name: artist.subtitle ?? 'Artist' },
        albumImageUrl: artist.imageUrl,
        duration: 0,
        provider: artist.provider,
        sourceId: artist.browseId,
      })),
    [results.artists]
  );

  const albumRows = useMemo(
    () =>
      results.albums.map((album) => ({
        id: album.id,
        title: album.title,
        artist: {
          id: album.id,
          name: album.year ? `${album.artist} • ${album.year}` : album.artist,
        },
        albumImageUrl: album.coverImageUrl,
        duration: 0,
        provider: album.provider,
        sourceId: album.browseId,
      })),
    [results.albums]
  );

  const playlistRows = useMemo(
    () =>
      results.playlists.map((playlist) => ({
        id: playlist.id,
        title: playlist.name,
        artist: { id: playlist.id, name: playlist.creator },
        albumImageUrl: playlist.coverImageUrl,
        duration: 0,
        provider: playlist.provider,
        sourceId: playlist.browseId,
      })),
    [results.playlists]
  );

  const openArtistRow = useCallback(
    (track: Track) => onOpenArtist(track.id, track.sourceId, track.title),
    [onOpenArtist]
  );
  const openAlbumRow = useCallback(
    (track: Track) => onOpenCollection(track.id, track.sourceId, track.title, 'album'),
    [onOpenCollection]
  );
  const openPlaylistRow = useCallback(
    (track: Track) => onOpenCollection(track.id, track.sourceId, track.title, 'playlist'),
    [onOpenCollection]
  );

  /** Track whose "add to playlist" sheet is open. */
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  const searchSections = useMemo<SearchSection[]>(() => {
    if (isBrowsing) return [];

    const makeItems = (kind: SearchSectionKind, tracks: Track[]): SearchListItem[] =>
      tracks.map((track, index) => ({ key: `${kind}:${track.id}:${index}`, track }));

    return [
      { title: 'Songs', kind: 'track' as const, data: makeItems('track', results.tracks) },
      { title: 'Artists', kind: 'artist' as const, data: makeItems('artist', artistRows) },
      { title: 'Albums', kind: 'album' as const, data: makeItems('album', albumRows) },
      { title: 'Playlists', kind: 'playlist' as const, data: makeItems('playlist', playlistRows) },
    ].filter((section) => section.data.length > 0);
  }, [albumRows, artistRows, isBrowsing, playlistRows, results.tracks]);

  return (
    <View style={styles.container}>
      <SectionList<SearchListItem, SearchSection>
        sections={searchSections}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SIZES.lg, paddingBottom: SIZES.bottomInset },
        ]}
        ListHeaderComponent={(
          <>
            <Text style={styles.headerTitle} accessibilityRole="header">Search</Text>

            <View style={[styles.searchContainer, isFocused && styles.searchFocused]}>
              <SearchIcon color={COLORS.text.secondary} size={20} />
              <TextInput
                style={styles.searchInput}
                placeholder="Songs, artists, albums..."
                placeholderTextColor={COLORS.text.secondary}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => searchNow(query)}
                returnKeyType="search"
                autoCorrect={false}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                accessibilityLabel="Search songs, artists, albums, and playlists"
              />
              {query ? (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={clear}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <X color={COLORS.text.secondary} size={20} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.filtersContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {FILTERS.map((f) => (
                  <Pill
                    key={f}
                    label={f}
                    isActive={filter === f}
                    onPress={() => setFilter(f)}
                  />
                ))}
              </ScrollView>
            </View>

            {isBrowsing ? (
              <>
                {recentQueries.length > 0 && (
                  <View>
                    <View style={styles.recentHeading}>
                      <Text style={styles.sectionTitle}>Recent searches</Text>
                      <TouchableOpacity onPress={() => LibraryService.clearSearchHistory()} accessibilityRole="button" accessibilityLabel="Clear Search History">
                        <Text style={styles.recentClear}>Clear Search History</Text>
                      </TouchableOpacity>
                    </View>
                    {recentQueries.map((recent) => (
                      <View key={recent.toLocaleLowerCase()} style={styles.recentRow}>
                        <TouchableOpacity style={styles.recentQuery} onPress={() => searchNow(recent)} accessibilityRole="button" accessibilityLabel={`Search again for ${recent}`}>
                          <Clock3 color={COLORS.text.secondary} size={18} />
                          <Text style={styles.recentText} numberOfLines={1}>{recent}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.clearButton} onPress={() => LibraryService.removeSearchHistory(recent)} accessibilityRole="button" accessibilityLabel={`Remove ${recent} from search history`}>
                          <X color={COLORS.text.secondary} size={18} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.sectionTitle}>Browse Vibe2X</Text>
                <View style={styles.categoriesGrid}>
                  {BROWSE_CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={styles.categoryCardWrapper}
                      activeOpacity={0.8}
                      onPress={() => searchNow(category.query)}
                      accessibilityRole="button"
                      accessibilityLabel={`Browse ${category.name}`}
                    >
                      <GlassCard intensity={20} style={styles.categoryCard}>
                        <View style={[styles.categoryGlow, { backgroundColor: category.color }]} />
                        <Text style={styles.categoryName}>{category.name}</Text>
                      </GlassCard>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                {error && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={retry}
                    accessibilityRole="button"
                    accessibilityLabel="Retry search"
                  >
                    <GlassCard intensity={20} style={styles.stateCard}>
                      <Text style={styles.stateText}>{error}</Text>
                      <Text style={styles.stateHint}>Tap to try again</Text>
                    </GlassCard>
                  </TouchableOpacity>
                )}
                {isSearching && !hasResults && (
                  <View style={styles.stateCenter}>
                    <ActivityIndicator color={COLORS.text.secondary} />
                  </View>
                )}
                {!isSearching && !error && !hasResults && (
                  <GlassCard intensity={20} style={styles.stateCard}>
                    <Text style={styles.stateText}>No results for "{query.trim()}"</Text>
                    <Text style={styles.stateHint}>Try a different spelling or filter</Text>
                  </GlassCard>
                )}
              </>
            )}
          </>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderSectionFooter={() => <View style={styles.sectionFooter} />}
        renderItem={({ item, section }) => {
          const row = item.track;
          if (section.kind === 'track') {
            return (
              <TrackRow
                track={row}
                onPress={onPlayTrack}
                onMorePress={setAddingTrack}
                onSwipeRight={addToQueue}
                isPlaying={currentTrack?.id === row.id && isPlaying}
              />
            );
          }

          const onPress =
            section.kind === 'artist'
              ? openArtistRow
              : section.kind === 'album'
                ? openAlbumRow
                : openPlaylistRow;
          return (
            <TrackRow
              track={row}
              onPress={onPress}
              isLoading={expandingId === row.id}
            />
          );
        }}
      />

      <StatusBarScrim />

      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          onPlayPause={togglePlayPause}
          onNext={next}
          onPress={() => navigation.navigate('NowPlaying' as never)}
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
  recentHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentClear: { color: COLORS.text.secondary, fontSize: 12 },
  recentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  recentQuery: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, minHeight: 48 },
  recentText: { flex: 1, color: COLORS.text.primary, fontSize: 15 },
  scrollContent: {
    paddingHorizontal: SIZES.md,
  },
  headerTitle: {
    ...TYPE.display,
    fontFamily: FONTS.bold,
    color: THEME.text.primary,
    marginBottom: SIZES.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
    borderRadius: SIZES.radius.md,
    paddingHorizontal: SIZES.md,
    height: 56,
    marginBottom: SIZES.lg,
  },
  searchFocused: {
    borderColor: THEME.border.focus,
    backgroundColor: THEME.surface.interactive,
  },
  clearButton: {
    width: 48,
    height: 48,
    marginRight: -SIZES.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: COLORS.text.primary,
    marginLeft: SIZES.sm,
  },
  filtersContainer: {
    marginBottom: SIZES.xl,
  },
  sectionTitle: {
    ...TYPE.section,
    fontFamily: FONTS.medium,
    color: THEME.text.primary,
    marginTop: SIZES.sm,
    marginBottom: SIZES.md,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryCardWrapper: {
    width: '48%',
    marginBottom: SIZES.md,
  },
  categoryCard: {
    minHeight: 112,
    padding: SIZES.md,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  categoryGlow: {
    position: 'absolute',
    right: -20,
    bottom: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.3,
    // Add a blur filter if running on web, otherwise rely on opacity
  },
  categoryName: {
    fontFamily: FONTS.medium,
    fontSize: 17,
    color: THEME.text.primary,
  },
  sectionFooter: {
    marginBottom: SIZES.lg,
  },
  stateCard: {
    padding: SIZES.md,
    marginBottom: SIZES.lg,
  },
  stateText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  stateHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 4,
  },
  stateCenter: {
    paddingVertical: SIZES.xl,
    alignItems: 'center',
  },
});
