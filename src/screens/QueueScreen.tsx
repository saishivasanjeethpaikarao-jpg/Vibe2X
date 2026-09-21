import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, X, Music, Search } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

/**
 * Full-screen queue view — replaces the broken 120px inline panel.
 *
 * Shows the currently playing track at the top, then a fully scrollable
 * "Up Next" list with remove buttons. Navigated to from NowPlaying or
 * directly via the queue icon.
 */
export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    currentTrack,
    upcoming,
    queueContext,
    jumpTo,
    removeFromQueue,
    clearQueue,
  } = usePlayer();

  const renderUpcomingTrack = ({ item, index }: { item: Track; index: number }) => (
    <View style={styles.trackRow}>
      <TouchableOpacity
        style={styles.trackRowMain}
        activeOpacity={0.7}
        onPress={() => jumpTo(item.id)}
      >
        <Image source={{ uri: item.albumImageUrl }} style={styles.trackThumb} />
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist.name}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => removeFromQueue(item.id)}
      >
        <X color={COLORS.text.muted} size={18} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={[COLORS.surfaceRaised, COLORS.background]}
        locations={[0, 0.3]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerIcon}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronDown color={COLORS.text.primary} size={28} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerSub}>PLAYING FROM</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {queueContext || 'VIBE²X'}
            </Text>
          </View>
          {upcoming.length > 0 ? (
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={clearQueue}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerIcon} />
          )}
        </View>

        {/* Now Playing */}
        {currentTrack && (
          <View style={styles.nowPlayingCard}>
            <Text style={styles.sectionLabel}>NOW PLAYING</Text>
            <View style={styles.nowPlayingRow}>
              <Image
                source={{ uri: currentTrack.albumImageUrl }}
                style={styles.nowPlayingThumb}
              />
              <View style={styles.nowPlayingInfo}>
                <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                <Text style={styles.nowPlayingArtist} numberOfLines={1}>
                  {currentTrack.artist.name}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Up Next */}
        <Text style={styles.sectionLabel}>UP NEXT</Text>

        {upcoming.length === 0 ? (
          <View style={styles.emptyState}>
            <Music color={COLORS.text.muted} size={48} />
            <Text style={styles.emptyTitle}>Your queue is empty</Text>
            <Text style={styles.emptySubtitle}>
              Search for songs to add to your queue
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => {
                navigation.goBack();
                // Navigate to search tab after going back
                setTimeout(() => {
                  (navigation as any).navigate('Main', { screen: 'Search' });
                }, 100);
              }}
            >
              <Search color={COLORS.background} size={16} />
              <Text style={styles.emptyButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={upcoming}
            renderItem={renderUpcomingTrack}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + SIZES.xxl }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: SIZES.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.md,
  },
  headerIcon: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerSub: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.text.secondary,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  clearText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.accent.magenta,
  },
  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2.5,
    color: COLORS.text.muted,
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
  },
  nowPlayingCard: {
    marginBottom: SIZES.sm,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.md,
    padding: SIZES.sm,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  nowPlayingThumb: {
    width: 56,
    height: 56,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  nowPlayingInfo: {
    flex: 1,
    marginLeft: SIZES.md,
  },
  nowPlayingTitle: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
  },
  nowPlayingArtist: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.glassBorder,
  },
  trackRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  trackInfo: {
    flex: 1,
    marginLeft: SIZES.sm,
    paddingRight: SIZES.sm,
  },
  trackTitle: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  trackArtist: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 1,
  },
  removeButton: {
    padding: SIZES.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyTitle: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
    marginTop: SIZES.lg,
  },
  emptySubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    marginTop: SIZES.xs,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.xs,
    marginTop: SIZES.xl,
    backgroundColor: COLORS.text.primary,
    paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.sm + 2,
    borderRadius: SIZES.radius.pill,
  },
  emptyButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.background,
  },
});
