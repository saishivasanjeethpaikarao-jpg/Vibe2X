import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { FONTS, MOTION, THEME } from '../../constants/theme';

const LAUNCH_FLAG = 'vibe2x:liquid-vibe-launch:v1';
const LOGO = require('../../../assets/icon.png');
const MARK_SIZE = 210;

type Props = { appReady: boolean };

/** Readiness overlay. App providers and navigation continue loading underneath. */
export function LaunchExperience({ appReady }: Props) {
  const reducedMotion = useReducedMotion();
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const leftX = useSharedValue(-86);
  const rightX = useSharedValue(86);
  const markScale = useSharedValue(0.96);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    const mountedAt = Date.now();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let storageFallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let configured = false;

    const configure = (seen: boolean) => {
      if (cancelled || configured) return;
      configured = true;
      if (storageFallbackTimer) clearTimeout(storageFallbackTimer);

      const totalDuration = reducedMotion
        ? 120
        : seen
          ? MOTION.duration.launchRepeat
          : MOTION.duration.launchFirst;
      const fadeDuration = reducedMotion ? 0 : Math.min(180, MOTION.duration.standard);
      const elapsed = Date.now() - mountedAt;
      const settleDuration = reducedMotion
        ? 0
        : Math.max(0, Math.round(totalDuration * 0.64) - elapsed);
      const waitBeforeFade = Math.max(0, totalDuration - fadeDuration - elapsed);

      leftX.value = withTiming(0, { duration: settleDuration, easing: MOTION.easing.out });
      rightX.value = withTiming(0, { duration: settleDuration, easing: MOTION.easing.out });
      markScale.value = withTiming(1, { duration: settleDuration, easing: MOTION.easing.out });
      deadlineTimer = setTimeout(() => setMinimumElapsed(true), waitBeforeFade);

      if (!seen) void AsyncStorage.setItem(LAUNCH_FLAG, 'seen').catch(() => undefined);
    };

    // A local storage read normally resolves immediately. A bounded fallback
    // keeps startup from waiting on it; all deadlines are measured from mount.
    // If the flag cannot be classified promptly, fail toward the complete
    // first-launch treatment rather than skipping it on a new installation.
    storageFallbackTimer = setTimeout(() => configure(false), 120);
    void AsyncStorage.getItem(LAUNCH_FLAG)
      .then((seen) => {
        if (!configured) configure(Boolean(seen));
        else if (!seen) void AsyncStorage.setItem(LAUNCH_FLAG, 'seen').catch(() => undefined);
      })
      .catch(() => configure(true));

    return () => {
      cancelled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (storageFallbackTimer) clearTimeout(storageFallbackTimer);
    };
  }, [leftX, markScale, reducedMotion, rightX]);

  useEffect(() => {
    if (!appReady || !minimumElapsed || hidden) return;
    overlayOpacity.value = withTiming(
      0,
      { duration: reducedMotion ? 0 : 180, easing: MOTION.easing.out },
      (finished) => {
        if (finished) runOnJS(setHidden)(true);
      }
    );
  }, [appReady, hidden, minimumElapsed, overlayOpacity, reducedMotion]);

  const leftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: leftX.value }] }));
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ translateX: rightX.value }] }));
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: markScale.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  if (hidden) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      accessible
      accessibilityRole="text"
      accessibilityLabel="Vibe2X is starting"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={[styles.overlay, overlayStyle]}
    >
      <Animated.View style={[styles.mark, markStyle]}>
        <Animated.View style={[styles.half, styles.leftHalf, leftStyle]}>
          <Image source={LOGO} style={styles.leftImage} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.half, styles.rightHalf, rightStyle]}>
          <Image source={LOGO} style={styles.rightImage} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
      <Text style={styles.wordmark}>Vibe2X</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    backgroundColor: THEME.background.amoled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: MARK_SIZE, height: MARK_SIZE, marginBottom: 18 },
  half: { position: 'absolute', top: 0, width: MARK_SIZE / 2, height: MARK_SIZE, overflow: 'hidden' },
  leftHalf: { left: 0 },
  rightHalf: { right: 0 },
  leftImage: { position: 'absolute', left: 0, top: 0, width: MARK_SIZE, height: MARK_SIZE },
  rightImage: { position: 'absolute', left: -MARK_SIZE / 2, top: 0, width: MARK_SIZE, height: MARK_SIZE },
  wordmark: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    letterSpacing: 5,
    color: THEME.text.primary,
  },
});
