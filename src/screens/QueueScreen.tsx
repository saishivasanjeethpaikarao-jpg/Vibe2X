import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Music, Search, ListPlus, Sparkles, GripVertical, MoreVertical } from 'lucide-react-native';
import { COLORS, SIZES, FONTS, THEME } from '../constants/theme';
import { Track } from '../core/types';
import { QueueEntry } from '../playback/queue';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
// @ts-ignore
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { LiquidSheet } from '../components/liquid/LiquidSheet';
import { useSnackbar } from '../components/common/SnackbarContext';
import { offlineMediaService } from '../offline/runtime';
import { manualDropTarget, QueueDragItem } from './queueDrag';

type QueueItem = QueueDragItem;

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { createPlaylist, settings } = useLibrary();
  const { show } = useSnackbar();
  const [selectedManual, setSelectedManual] = useState<Track | null>(null);
  const {
    currentTrack,
    upcomingEntries,
    queueContext,
    jumpTo,
    removeManualUpcoming,
    playNext,
    clearQueue,
    reorderQueue,
    isPreparingAuto,
    pendingTrack,
    transitionFeedback,
  } = usePlayer();

  const queueData = useMemo(() => {
    const data: QueueItem[] = [];
    let previousOrigin: QueueEntry['origin'] | null = null;
    upcomingEntries.forEach((entry, originalIndex) => {
      if (entry.origin !== previousOrigin) {
        const title = entry.origin === 'manual' ? 'Up next'
          : entry.origin === 'context' ? (queueContext ? `Playing next from ${queueContext}` : 'Playing next')
            : 'Smart Continue';
        data.push({ type: 'header', id: `header-${entry.origin}-${originalIndex}`, title });
        previousOrigin = entry.origin;
      }
      data.push({ type: 'track', id: `track-${entry.track.id}`, track: entry.track, origin: entry.origin, originalIndex });
    });
    return data;
  }, [upcomingEntries, queueContext]);
  const manualCount = upcomingEntries.filter((entry) => entry.origin === 'manual').length;
  const contextCount = upcomingEntries.filter((entry) => entry.origin === 'context').length;
  const autoCount = upcomingEntries.filter((entry) => entry.origin === 'smartContinue').length;

  const removeManual = (track: Track) => {
    if (removeManualUpcoming(track.id)) show('Removed from queue');
    setSelectedManual(null);
  };

  const renderRightActions = (item: Track) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => removeManual(item)}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.title} from queue`}
      >
        <Text style={styles.deleteActionText}>Remove</Text>
      </TouchableOpacity>
    );
  };

  const renderUpcomingTrack = ({ item, drag, isActive }: RenderItemParams<QueueItem>) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{item.title}</Text>
          {item.id.startsWith('header-smartContinue') && (
            <Sparkles size={14} color={COLORS.accent.violet} style={styles.sectionIcon} />
          )}
        </View>
      );
    }

    const { track, origin, originalIndex } = item;
    const isAuto = origin === 'smartContinue';
    const isManual = origin === 'manual';
    const reorderActions = isManual ? [
      ...(originalIndex > 0 ? [{ name: 'moveUp' as const, label: 'Move earlier' }] : []),
      ...(originalIndex < manualCount - 1
        ? [{ name: 'moveDown' as const, label: 'Move later' }]
        : []),
    ] : [];

    const row = (
      <View style={[
        styles.trackRow,
        isActive && styles.trackRowActive,
        isAuto && styles.trackRowAuto,
      ]}>
        <TouchableOpacity
          style={styles.trackRowMain}
          activeOpacity={0.7}
          onPress={() => jumpTo(track.id)}
          disabled={settings.offlineMode && !offlineMediaService.isAvailable(track)}
          accessibilityRole="button"
          accessibilityLabel={`Play ${track.title} by ${track.artist.name}`}
          accessibilityState={{ disabled: settings.offlineMode && !offlineMediaService.isAvailable(track) }}
        >
          <Image source={{ uri: track.albumImageUrl }} style={styles.trackThumb} />
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>{settings.offlineMode && !offlineMediaService.isAvailable(track) ? `${track.artist.name} • Streaming only` : track.artist.name}</Text>
          </View>
        </TouchableOpacity>
        {isManual && <TouchableOpacity
          style={styles.dragHandle}
          onLongPress={drag}
          delayLongPress={180}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${track.title}`}
          accessibilityHint="Long press and drag, or use accessibility actions"
          accessibilityActions={reorderActions}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'moveUp') reorderQueue(track.id, originalIndex - 1);
            if (event.nativeEvent.actionName === 'moveDown') reorderQueue(track.id, originalIndex + 1);
          }}
        >
          <GripVertical color={COLORS.text.muted} size={20} />
        </TouchableOpacity>}
        {isManual && <TouchableOpacity
          style={styles.dragHandle}
          onPress={() => setSelectedManual(track)}
          accessibilityRole="button"
          accessibilityLabel={`Queue actions for ${track.title}`}
        >
          <MoreVertical color={COLORS.text.secondary} size={20} />
        </TouchableOpacity>}
      </View>
    );

    return isManual ? (
      <Swipeable
        renderRightActions={() => renderRightActions(track)}
        overshootRight={false}
        rightThreshold={64}
        friction={2}
        containerStyle={{ overflow: 'visible' }}
      >
        {row}
      </Swipeable>
    ) : row;
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
              {currentTrack?.isAutoSuggested && autoCount > 0 ? 'Smart Continue' : queueContext || 'Vibe2X'}
            </Text>
          </View>
          {upcomingEntries.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.headerIcon}
                onPress={() => {
                  if (currentTrack) {
                    createPlaylist(`Queue • ${new Date().toLocaleDateString()}`, [currentTrack, ...upcomingEntries.map((entry) => entry.track)]);
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

        {pendingTrack && transitionFeedback !== 'hidden' && pendingTrack.id !== currentTrack?.id && (
          <Text style={styles.sectionLabel} accessibilityLiveRegion="polite">
            {transitionFeedback === 'failed'
              ? `Couldn't play ${pendingTrack.title}`
              : transitionFeedback === 'long'
                ? `Taking a little longer with ${pendingTrack.title}…`
                : `Preparing ${pendingTrack.title}…`}
          </Text>
        )}
        {isPreparingAuto && autoCount === 0 && (
          <Text style={styles.sectionLabel}>Preparing Auto Continue…</Text>
        )}

        {upcomingEntries.length === 0 ? (
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
            // The library wraps FlatList in its own View. Without sizing that
            // wrapper, the inner flex:1 list can measure to zero in this sheet.
            containerStyle={styles.list}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + SIZES.xxl }}
            showsVerticalScrollIndicator={false}
            activationDistance={12}
            onDragEnd={({ data: newData, from }) => {
              const target = manualDropTarget(queueData, newData, from);
              if (target) reorderQueue(target.trackId, target.toIndex);
            }}
          />
        )}
      </View>
      <LiquidSheet visible={selectedManual !== null} onClose={() => setSelectedManual(null)} accessibilityLabel="Queue actions">
        <Text style={styles.sheetTitle} numberOfLines={1}>{selectedManual?.title}</Text>
        {selectedManual && <>
          <TouchableOpacity style={styles.sheetAction} onPress={() => { playNext(selectedManual); setSelectedManual(null); }} accessibilityRole="button"><Text style={styles.sheetActionText}>Play next</Text></TouchableOpacity>
          <TouchableOpacity style={styles.sheetAction} onPress={() => { reorderQueue(selectedManual.id, 0); setSelectedManual(null); }} accessibilityRole="button"><Text style={styles.sheetActionText}>Move to top</Text></TouchableOpacity>
          <TouchableOpacity style={styles.sheetAction} onPress={() => removeManual(selectedManual)} accessibilityRole="button"><Text style={styles.sheetActionText}>Remove from queue</Text></TouchableOpacity>
        </>}
      </LiquidSheet>
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
  sheetTitle: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text.primary, marginBottom: SIZES.sm },
  sheetAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: SIZES.sm },
  sheetActionText: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.primary },
});
