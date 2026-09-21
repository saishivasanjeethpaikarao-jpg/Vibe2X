import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Heart, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, RotateCcw, RotateCw, MonitorSpeaker, Share, ListMusic, ListPlus, X } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { PlaybackSourceSheet } from '../components/player/PlaybackSourceSheet';
import { SeekBar } from '../components/player/SeekBar';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

/** Seconds -> m:ss, for the progress labels. */
const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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
    jumpTo,
    removeFromQueue,
    canPlayCurrent,
  } = usePlayer();

  const { isLiked, toggleLike } = useLibrary();
  const [showSource, setShowSource] = useState(false);
  /** Track whose "add to playlist" sheet is open. */
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  if (!currentTrack) return null;

  const liked = isLiked(currentTrack.id);
  const busy = isLoading || isBuffering;


  return (
    <View style={styles.container}>
      {/* Background artwork blur */}
      <Image
        source={{ uri: currentTrack.albumImageUrl }}
        style={StyleSheet.absoluteFill}
        blurRadius={100}
      />
      <LinearGradient
        colors={['rgba(5, 7, 7, 0.4)', COLORS.background]}
        locations={[0, 0.7]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + SIZES.md }]}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
            <ChevronDown color={COLORS.text.primary} size={28} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerSub}>PLAYING FROM</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {queueContext || 'VIBE²X'}
            </Text>
          </View>
          {/* Up Next already has its own toggle in the bottom row, so this
              opens "add to playlist" rather than duplicating it. */}
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => setAddingTrack(currentTrack)}
          >
            <ListPlus color={COLORS.text.primary} size={24} />
          </TouchableOpacity>
        </View>

        {/* Artwork */}
        <View style={styles.artworkContainer}>
          <Image source={{ uri: currentTrack.albumImageUrl }} style={styles.artwork} />
        </View>

        {/* Track Info */}
        <View style={styles.infoContainer}>
          <View style={styles.textInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>{currentTrack.artist.name}</Text>
          </View>
          <TouchableOpacity onPress={() => toggleLike(currentTrack)}>
            <Heart
              color={liked ? COLORS.accent.magenta : COLORS.text.primary}
              fill={liked ? COLORS.accent.magenta : 'transparent'}
              size={28}
            />
          </TouchableOpacity>
        </View>

        {/* Progress. SeekBar owns its own measurement, gesture handling and
            position subscription, so this screen no longer re-renders on every
            playback tick. */}
        <SeekBar onSeek={seekTo} />

        {/* Error state -- never leaves the player stuck */}
        {error && (
          <TouchableOpacity activeOpacity={0.8} onPress={retry} style={styles.errorBanner}>
            <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            <Text style={styles.errorHint}>Tap to retry</Text>
          </TouchableOpacity>
        )}

        {/* Relative seek, mirroring the lock-screen +/-10s buttons. */}
        <View style={styles.seekRow}>
          <TouchableOpacity style={styles.seekButton} onPress={() => seekBy(-10)}>
            <RotateCcw color={COLORS.text.secondary} size={22} />
            <Text style={styles.seekLabel}>10</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.seekButton} onPress={() => seekBy(10)}>
            <RotateCw color={COLORS.text.secondary} size={22} />
            <Text style={styles.seekLabel}>10</Text>
          </TouchableOpacity>
        </View>

        {/* Main Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity onPress={toggleShuffle}>
            <Shuffle color={shuffle ? COLORS.accent.magenta : COLORS.text.secondary} size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={previous}>
            <SkipBack color={COLORS.text.primary} size={32} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
            {busy ? (
              <ActivityIndicator color={COLORS.background} />
            ) : isPlaying ? (
              <Pause color={COLORS.background} size={32} fill={COLORS.background} />
            ) : (
              <Play color={COLORS.background} size={32} fill={COLORS.background} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={next}>
            <SkipForward color={COLORS.text.primary} size={32} />
          </TouchableOpacity>
          <TouchableOpacity onPress={cycleRepeat}>
            {repeat === 'one' ? (
              <Repeat1 color={COLORS.accent.magenta} size={24} />
            ) : (
              <Repeat
                color={repeat === 'all' ? COLORS.accent.magenta : COLORS.text.secondary}
                size={24}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity onPress={() => setShowSource(true)}>
            <MonitorSpeaker
              color={canPlayCurrent ? COLORS.text.secondary : COLORS.accent.red}
              size={24}
            />
          </TouchableOpacity>
          <TouchableOpacity>
            <Share color={COLORS.text.secondary} size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => (navigation as any).navigate('Queue')}>
            <ListMusic
              color={COLORS.text.secondary}
              size={24}
            />
          </TouchableOpacity>
        </View>

        {/* Up Next Preview */}
        {upcoming.length > 0 && (
          <TouchableOpacity 
            style={styles.upNextPreview}
            onPress={() => (navigation as any).navigate('Queue')}
            activeOpacity={0.8}
          >
            <View style={styles.upNextHeader}>
              <Text style={styles.upNextLabel}>Up Next</Text>
              <Text style={styles.upNextCount}>{upcoming.length} tracks</Text>
            </View>
            <Text style={styles.upNextTitle} numberOfLines={1}>
              {upcoming[0].title} <Text style={styles.upNextArtist}>• {upcoming[0].artist.name}</Text>
            </Text>
          </TouchableOpacity>
        )}

      </View>

      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />

      <PlaybackSourceSheet visible={showSource} onClose={() => setShowSource(false)} />
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
    paddingHorizontal: SIZES.lg,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  headerIcon: {
    padding: SIZES.xs,
  },
  headerTextContainer: {
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
  artworkContainer: {
    width: width - SIZES.lg * 2,
    height: width - SIZES.lg * 2,
    borderRadius: SIZES.radius.md,
    overflow: 'hidden',
    alignSelf: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    marginBottom: SIZES.xl,
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  textInfo: {
    flex: 1,
    paddingRight: SIZES.md,
  },
  trackTitle: {
    fontFamily: FONTS.medium,
    fontSize: 24,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  trackArtist: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  seekRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.xxl,
    marginBottom: SIZES.md,
  },
  seekButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.xs,
    paddingVertical: SIZES.xs,
    paddingHorizontal: SIZES.sm,
  },
  seekLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.xl,
    paddingHorizontal: SIZES.sm,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.text.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.xl,
    marginBottom: SIZES.xl,
  },
  errorBanner: {
    backgroundColor: COLORS.accent.redGlow,
    borderRadius: SIZES.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.accent.red,
    padding: SIZES.sm,
    marginBottom: SIZES.md,
  },
  errorText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text.primary,
  },
  errorHint: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  upNextPreview: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.md,
    padding: SIZES.sm,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  upNextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  upNextLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  upNextCount: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.text.muted,
  },
  upNextTitle: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  upNextArtist: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
});
