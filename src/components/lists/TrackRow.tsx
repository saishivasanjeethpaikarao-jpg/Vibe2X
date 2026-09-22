import React, { useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MoreVertical, ListPlus } from 'lucide-react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Track } from '../../core/types';
import { COLORS, SIZES, FONTS, THEME } from '../../constants/theme';

interface TrackRowProps {
  track: Track;
  /** Receives the row's track, so one stable callback can serve a whole list. */
  onPress: (track: Track) => void;
  isPlaying?: boolean;
  /** Shown while the row's target is being expanded or resolved. */
  isLoading?: boolean;
  onMorePress?: (track: Track) => void;
  onSwipeRight?: (track: Track) => void;
}

const TrackRowComponent: React.FC<TrackRowProps> = ({
  track,
  onPress,
  isPlaying,
  isLoading,
  onMorePress,
  onSwipeRight,
}) => {
  const handlePress = useCallback(() => onPress(track), [onPress, track]);
  const handleMorePress = useCallback(
    () => onMorePress?.(track),
    [onMorePress, track]
  );
  const ReanimatedSwipeableRef = useRef<any>(null);

  const renderLeftActions = () => (
    <View style={styles.swipeAction}>
      <ListPlus color={COLORS.text.primary} size={24} />
    </View>
  );

  const onSwipeableOpen = (direction: 'left' | 'right') => {
    if (direction === 'left' && onSwipeRight) {
      onSwipeRight(track);
      ReanimatedSwipeableRef.current?.close();
    }
  };

  const row = (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${track.title} by ${track.artist.name}`}
      accessibilityState={{ selected: Boolean(isPlaying), busy: Boolean(isLoading) }}
    >
      <Image source={{ uri: track.albumImageUrl }} style={styles.image} />
      {isPlaying && <View style={styles.playingIndicator} />}

      <View style={styles.infoContainer}>
        <Text style={[styles.title, isPlaying && styles.playingTitle]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist.name}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.moreButton}>
          <ActivityIndicator size="small" color={COLORS.text.secondary} />
        </View>
      ) : onMorePress ? (
        <TouchableOpacity
          style={styles.moreButton}
          onPress={handleMorePress}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${track.title}`}
        >
          <MoreVertical color={COLORS.text.secondary} size={20} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );

  return onSwipeRight ? (
    <ReanimatedSwipeable
      ref={ReanimatedSwipeableRef}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={onSwipeableOpen}
      overshootLeft={false}
    >
      {row}
    </ReanimatedSwipeable>
  ) : (
    row
  );
};

/**
 * Memoized: a track row only re-renders when its own props change.
 *
 * Lists re-render whenever playback state changes; without this every row in
 * a 50-row search result rebuilt its Image and Text nodes on each tap.
 */
export const TrackRow = React.memo(TrackRowComponent);

const styles = StyleSheet.create({
  swipeAction: {
    backgroundColor: COLORS.accent.violet,
    justifyContent: 'center',
    paddingHorizontal: SIZES.xl,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    paddingHorizontal: SIZES.md,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  playingIndicator: {
    width: 3,
    height: 28,
    borderRadius: 2,
    marginLeft: SIZES.xs,
    backgroundColor: THEME.accent.secondary,
  },
  infoContainer: {
    flex: 1,
    marginLeft: SIZES.md,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  playingTitle: {
    color: COLORS.accent.magenta,
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  moreButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
