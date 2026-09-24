import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, AccessibilityInfo, Platform } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { THEME, SIZES, FONTS, MOTION } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayer } from '../../hooks/usePlayer';

interface SnackbarProps {
  visible: boolean;
  message: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export const Snackbar: React.FC<SnackbarProps> = ({ visible, message, action }) => {
  const insets = useSafeAreaInsets();
  const { currentTrack } = usePlayer();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (visible && message) {
      AccessibilityInfo.announceForAccessibility(message);
    }

    const duration = MOTION.duration.standard;
    const easing = MOTION.easing.out;

    if (visible) {
      if (reducedMotion) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withTiming(1, { duration, easing });
        translateY.value = withTiming(0, { duration, easing });
      }
    } else {
      if (reducedMotion) {
        opacity.value = 0;
        translateY.value = 20;
      } else {
        opacity.value = withTiming(0, { duration, easing });
        translateY.value = withTiming(20, { duration, easing });
      }
    }
  }, [visible, message, reducedMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  const toast = (
    <Animated.View
      // On tab screens the mini-player sits above the bottom bar. The previous
      // bottom inset placed this message underneath both, making it invisible.
      style={[styles.container, { bottom: insets.bottom + (currentTrack ? 158 : 76) }, animatedStyle]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.content}>
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        {action && (
          <Pressable
            onPress={action.onPress}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );

  // Native-stack modal screens can sit above their React parent on iOS.
  // This host stays above those screens without opening a touch-blocking Modal.
  return Platform.OS === 'ios' ? (
    <FullWindowOverlay>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{toast}</View>
    </FullWindowOverlay>
  ) : toast;
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SIZES.md,
    right: SIZES.md,
    zIndex: 999,
    elevation: 999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.surface.glassStrong,
    borderRadius: SIZES.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border.glass,
    paddingHorizontal: SIZES.md,
    paddingVertical: 14,
  },
  message: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: THEME.text.primary,
  },
  actionButton: {
    marginLeft: SIZES.md,
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: SIZES.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: THEME.accent.secondary,
  },
});
