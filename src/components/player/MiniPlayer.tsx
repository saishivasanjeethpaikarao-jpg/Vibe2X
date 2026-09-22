import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Play, Pause, MonitorSpeaker, SkipForward } from 'lucide-react-native';
import { Track } from '../../core/types';
import { useProgress } from '../../hooks/usePlayer';
import { PlaybackSourceSheet } from './PlaybackSourceSheet';
import { COLORS, SIZES, FONTS, THEME } from '../../constants/theme';
import { GlassSurface } from '../liquid/GlassSurface';
import { PressableScale } from '../liquid/PressableScale';

interface MiniPlayerProps {
  track: Track | null;
  isPlaying: boolean;
  onPress: () => void;
  onPlayPause: () => void;
  onNext?: () => void;
  tabBarHeight?: number;
  isLoading?: boolean;
}

/**
 * Only this subtree subscribes to playback position.
 *
 * useProgress fires ~4x a second. Reading it in MiniPlayer itself re-rendered
 * the artwork and both Text nodes on every tick; isolating it here keeps the
 * bar live while the rest of the bar stays still.
 */
const MiniPlayerProgress: React.FC = React.memo(() => {
  const { position, duration } = useProgress();

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
    </View>
  );
});
MiniPlayerProgress.displayName = 'MiniPlayerProgress';

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ 
  track, 
  isPlaying, 
  onPress, 
  onPlayPause,
  onNext,
  tabBarHeight = Platform.OS === 'ios' ? 88 : 72,
  isLoading = false
}) => {
  const [showSource, setShowSource] = useState(false);


  if (!track) return null;

  return (
    <>
    <View
      style={[
        styles.positionContainer, 
        { bottom: tabBarHeight }
      ]}
    >
      <GlassSurface strength="floating" style={styles.container}>
        <View style={styles.content}>
          <PressableScale
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Open Now Playing for ${track.title} by ${track.artist.name}`}
            style={styles.openPlayerButton}
            contentStyle={styles.openPlayerContent}
          >
            <Image source={{ uri: track.albumImageUrl }} style={styles.image} />
            <View style={styles.infoContainer}>
              <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.artist} numberOfLines={1}>{track.artist.name}</Text>
            </View>
          </PressableScale>

          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Playback source"
              onPress={() => setShowSource(true)}
            >
               <MonitorSpeaker color={COLORS.text.secondary} size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.playButton}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              onPress={onPlayPause}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.text.primary} />
              ) : isPlaying ? (
                <Pause color={COLORS.text.primary} size={24} fill={COLORS.text.primary} />
              ) : (
                <Play color={COLORS.text.primary} size={24} fill={COLORS.text.primary} />
              )}
            </TouchableOpacity>
            {onNext && (
              <TouchableOpacity
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Next track"
                onPress={onNext}
              >
                <SkipForward color={COLORS.text.primary} size={20} fill={COLORS.text.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        {/* Progress Bar */}
        <MiniPlayerProgress />
      </GlassSurface>
    </View>
    <PlaybackSourceSheet visible={showSource} onClose={() => setShowSource(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  positionContainer: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 100,
  },
  container: {
    borderRadius: SIZES.radius.md,
    overflow: 'hidden',
    backgroundColor: THEME.surface.glassStrong,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    padding: 8,
  },
  openPlayerButton: {
    flex: 1,
  },
  openPlayerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  image: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  infoContainer: {
    flex: 1,
    marginLeft: SIZES.sm,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    minWidth: SIZES.touchTarget,
    minHeight: SIZES.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: SIZES.touchTarget,
    height: SIZES.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SIZES.touchTarget / 2,
    backgroundColor: THEME.surface.selected,
    marginLeft: SIZES.xs,
  },
  progressTrack: {
    height: 2,
    backgroundColor: COLORS.player.progressTrack,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.player.progressFill,
  }
});
