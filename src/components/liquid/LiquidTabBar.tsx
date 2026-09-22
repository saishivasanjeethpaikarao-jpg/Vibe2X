import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { MOTION, THEME } from '../../constants/theme';
import { GlassSurface } from './GlassSurface';

export function LiquidTabBarBackground() {
  return <GlassSurface strength="strong" style={styles.background} />;
}

export function LiquidTabIcon({
  Icon,
  color,
  focused,
}: {
  Icon: LucideIcon;
  color: string;
  focused: boolean;
}) {
  const active = useSharedValue(focused ? 1 : 0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, {
      duration: reducedMotion ? 0 : MOTION.duration.standard,
      easing: MOTION.easing.out,
    });
  }, [active, focused, reducedMotion]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scaleX: 0.74 + active.value * 0.26 }],
  }));

  return (
    <View style={styles.iconWrap}>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      <Icon color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 0,
    backgroundColor: THEME.surface.glassStrong,
  },
  iconWrap: {
    width: 46,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    width: 42,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.surface.selected,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.focus,
  },
});
