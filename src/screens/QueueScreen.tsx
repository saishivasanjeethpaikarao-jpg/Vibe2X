import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Music, Search, ListPlus, Sparkles, GripVertical } from 'lucide-react-native';
import { COLORS, SIZES, FONTS, THEME } from '../constants/theme';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
// @ts-ignore
import Swipeable from 'react-native-gesture-handler/Swipeable';

type QueueItem =
  | { type: 'header'; id: string; title: string }
  | { type: 'track'; id: string; track: Track; originalIndex: number };

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { createPlaylist, settings } = useLibrary();
  const {
    currentTrack,
    upcoming,
    manualUpcoming,
    contextUpcoming,
    autoUpcoming,
    queueContext,
    jumpTo,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    isPreparingAuto,
    pendingTrack,
  } = usePlayer();

  const queueData = useMemo(() => {
    const data: QueueItem[] = [];
    let trackIndex = 0;
    if (manualUpcoming.length > 0) {
      data.push({ type: 'header', id: 'header-manual', title: 'Up next' });
      data.push(...manualUpcoming.map(t => ({ type: 'track' as const, id: `track-${t.id}`, track: t, originalIndex: trackIndex++ })));
    }
    if (contextUpcoming.length > 0) {
      data.push({ type: 'header', id: 'header-context', title: queueContext ? `Playing next from ${queueContext}` : 'Playing next' });
      data.push(...contextUpcoming.map(t => ({ type: 'track' as const, id: `track-${t.id}`, track: t, originalIndex: trackIndex++ })));
    }
    if (autoUpcoming.length > 0) {
      data.push({ type: 'header', id: 'header-auto', title: 'Smart Continue' });
      data.push(...autoUpcoming.map(t => ({ type: 'track' as const, id: `track-${t.id}`, track: t, originalIndex: trackIndex++ })));
    }
    return data;
  }, [manualUpcoming, contextUpcoming, autoUpcoming, queueContext]);
  const manualCount = manualUpcoming.length;
  const contextCount = contextUpcoming.length;
  const contextIds = useMemo(() => new Set(contextUpcoming.map((track) => track.id)), [contextUpcoming]);

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

  const renderUpcomingTrack = ({ item, drag, isActive, getIndex }: RenderItemParams<QueueItem>) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{item.title}</Text>
          {item.id === 'header-auto' && (
            <Sparkles size={14} color={COLORS.accent.violet} style={styles.sectionIcon} />
          )}
        </View>
      );
    }

    const { track, originalIndex } = item;
    const isAuto = track.isAutoSuggested;

    const isContext = contextIds.has(track.id);
    const firstInSection = isAuto ? manualCount + contextCount : isContext ? manualCount : 0;
    const lastInSection = isAuto ? upcoming.length - 1 : isContext ? manualCount + contextCount - 1 : manualCount - 1;
    const reorderActions = [
      ...(originalIndex > firstInSection ? [{ name: 'moveUp' as const, label: 'Move earlier' }] : []),
      ...(originalIndex >= 0 && originalIndex < lastInSection
        ? [{ name: 'moveDown' as const, label: 'Move later' }]
        : []),
    ];

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(track)}
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
            onPress={() => jumpTo(track.id)}
            accessibilityRole="button"
            accessibilityLabel={`Play ${track.title} by ${track.artist.name}`}
          >
            <Image source={{ uri: track.albumImageUrl }} style={styles.trackThumb} />
            <View style={styles.trackInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
              </View>
              <Text style={styles.trackArtist} numberOfLines={1}>{track.artist.name}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dragHandle}
            onLongPress={drag}
            delayLongPress={150}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${track.title}`}
            accessibilityHint="Long press and drag, or use accessibility actions"
            accessibilityActions={reorderActions}
            onAccessibilityAction={(event) => {
              if (originalIndex < 0) return;
              if (event.nativeEvent.actionName === 'moveUp' && originalIndex > firstInSection) {
                reorderQueue(originalIndex, originalIndex - 1);
              } else if (
                event.nativeEvent.actionName === 'moveDown' &&
                originalIndex < lastInSection
              ) {
                reorderQueue(originalIndex, originalIndex + 1);
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
              {currentTrack?.isAutoSuggested ? 'Smart Continue' : queueContext || 'Vibe2X'}
            </Text>
          </View>
          {manualCount > 0 || upcoming.length > 0 ? (
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
              {manualCount > 0 && <TouchableOpacity
                  style={styles.clearUpNextButton}
                  onPress={clearQueue}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear Up Next"
                >
                  <Text style={styles.clearText}>Clear Up Next</Text>
                </TouchableOpacity>}
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

        {pendingTrack && pendingTrack.id !== currentTrack?.id && (
          <Text style={styles.sectionLabel}>Preparing {pendingTrack.title}…</Text>
        )}
        {isPreparingAuto && upcoming.every((track) => !track.isAutoSuggested) && (
          <Text style={styles.sectionLabel}>Preparing Auto Continue…</Text>
        )}

        {upcoming.length === 0 ? (
          <View style={styles.emptyState}>
            <Music color={COLORS.text.muted} size={48} />
            <Text style={styles.emptyTitle}>{isPreparingAuto ? 'Finding what plays next' : 'Your queue is empty'}</Text>
            <Text style={styles.emptySubtitle}>
              {settings.autoplayRelated
                ? 'Auto Continue is finding music from your current track.'
                : 'Search for songs to add to your queue.'}
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
            data={queueData}
            renderItem={renderUpcomingTrack}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + SIZES.xxl }}
            showsVerticalScrollIndicator={false}
            onDragEnd={({ data: newData, from, to }) => {
              if (from === to) return;

              const oldTracks = queueData.filter(x => x.type === 'track');
              const newTracks = newData.filter(x => x.type === 'track');

              const movedItem = queueData[from];
              if (movedItem.type === 'header') return; // Should not happen since no drag handle for header

              const originalFrom = oldTracks.findIndex(t => t.id === movedItem.id);
              const originalTo = newTracks.findIndex(t => t.id === movedItem.id);
              const staysInSection = movedItem.track.isAutoSuggested
                ? originalTo >= manualCount + contextCount
                : contextIds.has(movedItem.track.id)
                  ? originalTo >= manualCount && originalTo < manualCount + contextCount
                  : originalTo < manualCount;

              if (staysInSection && originalFrom !== -1 && originalTo !== -1 && originalFrom !== originalTo) {
                reorderQueue(originalFrom, originalTo);
              }
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
    backgroundColor: 'rgba(0, 0, 0, 0.44)',
  },
  content: {
    height: '92%',
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.sm,
    backgroundColor: THEME.background.elevated,
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
  clearUpNextButton: { minWidth: 94, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    letterSpacing: 0.2,
    color: THEME.text.secondary,
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
  },
  sectionIcon: {
    marginLeft: SIZES.xs,
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
