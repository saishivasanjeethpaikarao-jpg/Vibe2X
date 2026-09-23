import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  Heart,
  ListMusic,
  ListPlus,
  MonitorSpeaker,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { ArtworkAtmosphere } from '../components/liquid/ArtworkAtmosphere';
import { GlassSurface } from '../components/liquid/GlassSurface';
import { PressableScale } from '../components/liquid/PressableScale';
import { PlaybackSourceSheet } from '../components/player/PlaybackSourceSheet';
import { SeekBar } from '../components/player/SeekBar';
import { SleepTimerSheet } from '../components/player/SleepTimerSheet';
import { COLORS, FONTS, SIZES, THEME, TYPE } from '../constants/theme';
import { Track } from '../core/types';
import { useLibrary } from '../hooks/useLibrary';
import { usePlayer } from '../hooks/usePlayer';
import { confirmLocalMutation } from '../core/confirmedMutation';
import { useSnackbar } from '../components/common/SnackbarContext';

export default function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    isLoading,
    isBuffering,
    error,
    retry,
    seekTo,
    seekBy,
    next,
    previous,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    upcoming,
    queueContext,
    canPlayCurrent,
    sleepTimerExpiration,
    setSleepTimer,
    stopAtEndOfQueue,
    setStopAtEndOfQueue,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const { show } = useSnackbar();
  const [showSource, setShowSource] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const translateX = useSharedValue(0);

  const onGestureEvent = (event: any) => {
    translateX.value = reducedMotion ? 0 : event.nativeEvent.translationX;
  };

  const onGestureEnd = (event: any) => {
    const { translationX, velocityX } = event.nativeEvent;
    const goNext = translationX < -60 || velocityX < -500;
    const goPrevious = translationX > 60 || velocityX > 500;
    if (!goNext && !goPrevious) {
      translateX.value = reducedMotion ? 0 : withSpring(0, { damping: 18, stiffness: 210 });
      return;
    }

    const action = goNext ? next : previous;
    if (reducedMotion) {
      action();
      translateX.value = 0;
      return;
    }

    translateX.value = withTiming(goNext ? -width : width, { duration: 180 }, () => {
      runOnJS(action)();
      translateX.value = goNext ? width : -width;
      translateX.value = withSpring(0, { damping: 19, stiffness: 220 });
    });
  };

  const artworkStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  if (!currentTrack) return null;

  const liked = isLiked(currentTrack.id);
  const busy = isLoading || isBuffering;
  const artworkSize = Math.min(width - SIZES.lg * 2, 420);

  return (
    <View style={styles.container}>
      <ArtworkAtmosphere artworkUrl={currentTrack.albumImageUrl} intensity="hero" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + SIZES.sm, paddingBottom: insets.bottom + SIZES.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Close now playing"
          >
            <ChevronDown color={THEME.text.primary} size={26} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.sourceLabel}>Playing from</Text>
            <Text style={styles.sourceTitle} numberOfLines={1}>{currentTrack.isAutoSuggested ? 'Smart Continue' : queueContext || 'Vibe2X'}</Text>
          </View>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setAddingTrack(currentTrack)}
            accessibilityRole="button"
            accessibilityLabel="Add track to playlist"
          >
            <ListPlus color={THEME.text.primary} size={23} />
          </TouchableOpacity>
        </View>

        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onEnded={onGestureEnd}
          activeOffsetX={[-12, 12]}
        >
          <Animated.View
            style={[
              styles.artworkFrame,
              { width: artworkSize, height: artworkSize },
              artworkStyle,
            ]}
          >
            <Image
              source={{ uri: currentTrack.albumImageUrl }}
              style={styles.artwork}
              accessibilityLabel={`Artwork for ${currentTrack.title}`}
            />
          </Animated.View>
        </PanGestureHandler>

        <View style={styles.trackInfo}>
          <View style={styles.trackCopy}>
            <Text style={styles.trackTitle} numberOfLines={2}>{currentTrack.title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>{currentTrack.artist.name}</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={async () => {
              const wasLiked = isLiked(currentTrack.id);
              try {
                const saved = await confirmLocalMutation(
                  () => toggleLike(currentTrack),
                  () => show(wasLiked ? 'Unliked' : 'Liked')
                );
                if (!saved) show('Could not save liked songs');
              } catch {
                show('Could not save liked songs');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Remove from liked songs' : 'Add to liked songs'}
            accessibilityState={{ selected: liked }}
          >
            <Heart
              color={liked ? THEME.accent.secondary : THEME.text.primary}
              fill={liked ? THEME.accent.secondary : 'transparent'}
              size={27}
            />
          </TouchableOpacity>
        </View>

        <SeekBar onSeek={seekTo} />

        {error && (
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={retry}
            style={styles.errorBanner}
            accessibilityRole="button"
            accessibilityLabel={`${error}. Tap to retry playback.`}
          >
            <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            <Text style={styles.errorHint}>Tap to retry</Text>
          </TouchableOpacity>
        )}

        <View style={styles.transport}>
          <TouchableOpacity
            style={styles.transportButton}
            onPress={toggleShuffle}
            accessibilityRole="button"
            accessibilityLabel={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
            accessibilityState={{ selected: shuffle }}
          >
            <Shuffle color={shuffle ? THEME.accent.secondary : THEME.text.secondary} size={23} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.transportButton} onPress={previous} accessibilityLabel="Previous track">
            <SkipBack color={THEME.text.primary} size={30} fill={THEME.text.primary} />
          </TouchableOpacity>
          <PressableScale
            onPress={togglePlayPause}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            contentStyle={styles.playButton}
            pressedScale={0.96}
          >
            {busy ? (
              <ActivityIndicator color={THEME.text.inverse} />
            ) : isPlaying ? (
              <Pause color={THEME.text.inverse} size={32} fill={THEME.text.inverse} />
            ) : (
              <Play color={THEME.text.inverse} size={32} fill={THEME.text.inverse} />
            )}
          </PressableScale>
          <TouchableOpacity style={styles.transportButton} onPress={next} accessibilityLabel="Next track">
            <SkipForward color={THEME.text.primary} size={30} fill={THEME.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.transportButton}
            onPress={cycleRepeat}
            accessibilityRole="button"
            accessibilityLabel={`Repeat mode ${repeat}`}
            accessibilityState={{ selected: repeat !== 'off' }}
          >
            {repeat === 'one' ? (
              <Repeat1 color={THEME.accent.secondary} size={23} />
            ) : (
              <Repeat color={repeat === 'all' ? THEME.accent.secondary : THEME.text.secondary} size={23} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.seekShortcuts}>
          <TouchableOpacity style={styles.seekButton} onPress={() => seekBy(-10)} accessibilityLabel="Seek back 10 seconds">
            <RotateCcw color={THEME.text.secondary} size={20} />
            <Text style={styles.seekLabel}>10 sec</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.seekButton} onPress={() => seekBy(10)} accessibilityLabel="Seek forward 10 seconds">
            <RotateCw color={THEME.text.secondary} size={20} />
            <Text style={styles.seekLabel}>10 sec</Text>
          </TouchableOpacity>
        </View>

        <GlassSurface strength="strong" style={styles.utilities}>
          <UtilityButton
            label="Source"
            Icon={MonitorSpeaker}
            active={!canPlayCurrent}
            onPress={() => setShowSource(true)}
          />
          <UtilityButton
            label="Timer"
            Icon={Timer}
            active={Boolean(sleepTimerExpiration)}
            onPress={() => setShowSleepTimer(true)}
          />
          <UtilityButton
            label="Queue"
            Icon={ListMusic}
            onPress={() => (navigation as any).navigate('Queue')}
          />
        </GlassSurface>

        {upcoming.length > 0 && (
          <PressableScale
            onPress={() => (navigation as any).navigate('Queue')}
            accessibilityRole="button"
            accessibilityLabel={`Open queue, ${upcoming.length} tracks up next`}
            contentStyle={styles.upNext}
          >
            <View style={styles.upNextHeader}>
              <Text style={styles.upNextLabel}>{upcoming[0].isAutoSuggested ? 'Smart Continue' : 'Up next'}</Text>
              <Text style={styles.upNextCount}>{upcoming.length} tracks</Text>
            </View>
            <Text style={styles.upNextTitle} numberOfLines={1}>{upcoming[0].title}</Text>
            <Text style={styles.upNextArtist} numberOfLines={1}>{upcoming[0].artist.name}</Text>
          </PressableScale>
        )}
      </ScrollView>

      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />
      <PlaybackSourceSheet visible={showSource} onClose={() => setShowSource(false)} />
      <SleepTimerSheet
        visible={showSleepTimer}
        onClose={() => setShowSleepTimer(false)}
        expiration={sleepTimerExpiration}
        onSetTimer={setSleepTimer}
        stopAtEndOfQueue={stopAtEndOfQueue}
        onStopAtEndOfQueue={setStopAtEndOfQueue}
      />
    </View>
  );
}

function UtilityButton({
  label,
  Icon,
  active = false,
  onPress,
}: {
  label: string;
  Icon: typeof MonitorSpeaker;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.utilityButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Icon color={active ? THEME.accent.secondary : THEME.text.secondary} size={22} />
      <Text style={[styles.utilityLabel, active && styles.utilityLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background.primary },
  content: { flexGrow: 1, paddingHorizontal: SIZES.lg },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.lg },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center', paddingHorizontal: SIZES.sm },
  sourceLabel: { ...TYPE.caption, textTransform: 'uppercase', letterSpacing: 1.2, color: THEME.text.secondary },
  sourceTitle: { marginTop: 2, fontFamily: FONTS.medium, fontSize: 14, color: THEME.text.primary },
  artworkFrame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: THEME.surface.interactive,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.36,
    shadowRadius: 22,
    elevation: 11,
    marginBottom: SIZES.xl,
  },
  artwork: { width: '100%', height: '100%' },
  trackInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.lg },
  trackCopy: { flex: 1, paddingRight: SIZES.sm },
  trackTitle: { ...TYPE.title, fontFamily: FONTS.bold, color: THEME.text.primary, letterSpacing: -0.35 },
  trackArtist: { marginTop: SIZES.xs, fontFamily: FONTS.regular, fontSize: 16, color: THEME.text.secondary },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SIZES.md },
  transportButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  playButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.text.primary,
  },
  seekShortcuts: { flexDirection: 'row', justifyContent: 'center', gap: SIZES.xxl, marginTop: SIZES.sm },
  seekButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: SIZES.xs, paddingHorizontal: SIZES.sm },
  seekLabel: { fontFamily: FONTS.medium, fontSize: 12, color: THEME.text.secondary },
  utilities: {
    minHeight: 76,
    marginTop: SIZES.md,
    borderRadius: SIZES.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  utilityButton: { minWidth: 76, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  utilityLabel: { marginTop: 4, fontFamily: FONTS.medium, fontSize: 11, color: THEME.text.secondary },
  utilityLabelActive: { color: THEME.accent.secondary },
  errorBanner: {
    marginTop: SIZES.sm,
    marginBottom: SIZES.sm,
    padding: SIZES.sm,
    borderRadius: SIZES.radius.sm,
    backgroundColor: THEME.accent.softDanger,
  },
  errorText: { fontFamily: FONTS.medium, fontSize: 13, color: THEME.text.primary },
  errorHint: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: THEME.text.secondary },
  upNext: {
    marginTop: SIZES.md,
    padding: SIZES.md,
    borderRadius: SIZES.radius.md,
    backgroundColor: THEME.surface.interactive,
  },
  upNextHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SIZES.xs },
  upNextLabel: { fontFamily: FONTS.medium, fontSize: 13, color: THEME.text.secondary },
  upNextCount: { fontFamily: FONTS.regular, fontSize: 12, color: THEME.text.secondary },
  upNextTitle: { fontFamily: FONTS.medium, fontSize: 15, color: THEME.text.primary },
  upNextArtist: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, color: THEME.text.secondary },
});
