import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart } from 'lucide-react-native';
import { THEME, SIZES } from '../../constants/theme';

interface LikedSongsCoverProps {
  size: number;
  style?: ViewStyle;
  empty?: boolean;
}

export function LikedSongsCover({ size, style, empty = false }: LikedSongsCoverProps) {
  return (
    <LinearGradient
      colors={[THEME.surface.raised, THEME.accent.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: SIZES.radius.sm,
        },
        style,
      ]}
    >
      <View style={styles.innerFrame} />
      <Heart
        size={size * 0.4}
        color={THEME.text.primary}
        fill={empty ? 'transparent' : THEME.text.primary}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  innerFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
  },
});
