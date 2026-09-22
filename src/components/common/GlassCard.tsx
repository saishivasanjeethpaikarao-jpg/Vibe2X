import React from 'react';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { SIZES } from '../../constants/theme';
import { GlassSurface } from '../liquid/GlassSurface';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  rounded?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  style, 
  intensity = 30,
  tint: _tint = 'dark',
  rounded = true
}) => {
  return (
    <GlassSurface
      blurIntensity={intensity}
      style={[
        styles.container,
        rounded && styles.rounded,
        style
      ]}
    >
      {children}
    </GlassSurface>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  rounded: {
    borderRadius: SIZES.radius.md,
  }
});
