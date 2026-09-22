import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Music, Search, ListPlus } from 'lucide-react-native';
import { COLORS, SIZES, FONTS, THEME } from '../constants/theme';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';

/**
 * Queue sheet — replaces the broken 120px inline panel.
 *
 * Shows the currently playing track at the top, then a fully scrollable
 * "Up Next" list with remove buttons. Navigated to from NowPlaying or
 * directly via the queue icon.
 */
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
// @ts-ignore
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GripVertical, Sparkles } from 'lucide-react-native';

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { createPlaylist } = useLibrary();
  const {
    currentTrack,
    upcoming,
    queueContext,
    jumpTo,
    removeFromQueue,
    clearQueue,
    reorderQueue,
  } = usePlayer();

  const renderRightActions = (item: Track) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => removeFromQueue(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.title} from queue`}
      >
        <Text style={styles.deleteActionText}>Remove</Text>
      </TouchableOpacity>
    );
  };

  const renderUpcomingTrack = ({ item, drag, isActive, getIndex }: RenderItemParams<Track>) => {
    const isAuto = item.isAutoSuggested;
    const index = getIndex() ?? -1;
    const reorderActions = [
      ...(index > 0 ? [{ name: 'moveUp' as const, label: 'Move earlier' }] : []),
      ...(index >= 0 && index < upcoming.length - 1
        ? [{ name: 'moveDown' as const, label: 'Move later' }]
        : []),
    ];
    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
        containerStyle={{ overflow: 'visible' }}
      >
        <View style={[
          styles.trackRow,
          isActive && styles.trackRowActive,
          isAuto && styles.trackRowAuto,
        ]}>
          <TouchableOpacity
            style={styles.trackRowMain}
            activeOpacity={0.7}
            onPress={() => jumpTo(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.title} by ${item.artist.name}`}
          >
            <Image source={{ uri: item.albumImageUrl }} style={styles.trackThumb} />
            <View style={styles.trackInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                {isAuto && <Sparkles size={12} color={COLORS.accent.violet} style={{ marginLeft: 4 }} />}
              </View>
              <Text style={styles.trackArtist} numberOfLines={1}>{item.artist.name}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dragHandle}
            onLongPress={drag}
            delayLongPress={150}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${item.title}`}
            accessibilityHint="Long press and drag, or use accessibility actions"
            accessibilityActions={reorderActions}
            onAccessibilityAction={(event) => {
              if (index < 0) return;
              if (event.nativeEvent.actionName === 'moveUp' && index > 0) {
                reorderQueue(index, index - 1);
              } else if (
                event.nativeEvent.actionName === 'moveDown' &&
                index < upcoming.length - 1
              ) {
                reorderQueue(index, index + 1);
              }
            }}
          >
            <GripVertical color={COLORS.text.muted} size={20} />
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Close queue"
      />

      <View style={styles.content}>
        <View style={styles.sheetHandle} />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerIcon}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close queue"
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.headerIcon}
                onPress={() => {
                  if (currentTrack) {
                    createPlaylist(`Queue • ${new Date().toLocaleDateString()}`, [currentTrack, ...upcoming]);
                  }
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Save queue as playlist"
              >
                <ListPlus color={COLORS.text.secondary} size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerIcon}
                onPress={clearQueue}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Clear queue"
              >
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.headerIcon} />
          )}
        </View>

        {/* Now Playing */}
        {currentTrack && (
          <View style={styles.nowPlayingCard}>
            <Text style={styles.sectionLabel}>Now playing</Text>
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
        <Text style={styles.sectionLabel}>Up next</Text>

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
                  (navigation as any).navigate('Main', { screen: 'SearchTab' });
                }, 100);
              }}
            >
              <Search color={COLORS.background} size={16} />
              <Text style={styles.emptyButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <DraggableFlatList
            data={upcoming}
            renderItem={renderUpcomingTrack}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + SIZES.xxl }}
            showsVerticalScrollIndicator={false}
            onDragEnd={({ from, to }) => {
              if (from !== to) reorderQueue(from, to);
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  content: {
    height: '92%',
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.sm,
    backgroundColor: THEME.surface.glassStrong,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: THEME.text.disabled,
    marginBottom: SIZES.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.md,
  },
  headerIcon: {
    width: 48,
    height: 48,
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
    fontSize: 13,
    letterSpacing: 0.2,
    color: THEME.text.secondary,
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
  },
  nowPlayingCard: {
    marginBottom: SIZES.sm,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface.interactive,
    borderRadius: SIZES.radius.md,
    padding: SIZES.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
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
    minHeight: 48,
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
  deleteAction: {
    backgroundColor: THEME.accent.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteActionText: {
    color: '#fff',
    fontFamily: FONTS.medium,
    fontSize: 13,
  },
  trackRowActive: {
    backgroundColor: COLORS.surfaceRaised,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  trackRowAuto: {
    opacity: 0.8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dragHandle: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
