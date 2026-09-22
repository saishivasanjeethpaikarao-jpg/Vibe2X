import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { SHADOWS, THEME } from '../../constants/theme';

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  strength?: 'soft' | 'strong' | 'floating';
  blurIntensity?: number;
  accessibilityLabel?: string;
};

/** Progressive material: native blur where reliable, designed solid fallback on Android. */
export const GlassSurface = React.memo(function GlassSurface({
  children,
  style,
  strength = 'soft',
  blurIntensity = 34,
  accessibilityLabel,
}: Props) {
  const materialStyle = [
    styles.base,
    strength === 'strong' && styles.strong,
    strength === 'floating' && [styles.floating, SHADOWS.floating],
    style,
  ];

  if (Platform.OS === 'android') {
    return (
      <View style={materialStyle} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }

  return (
    <BlurView
      tint="dark"
      intensity={blurIntensity}
      style={materialStyle}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </BlurView>
  );
});

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: THEME.surface.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
  },
  strong: { backgroundColor: THEME.surface.glassStrong },
  floating: { backgroundColor: THEME.surface.glassStrong },
});
