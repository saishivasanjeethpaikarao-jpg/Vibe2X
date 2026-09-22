import React from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MOTION } from '../../constants/theme';

type Props = PressableProps & {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  pressedScale?: number;
};

export function PressableScale({
  children,
  contentStyle,
  pressedScale = MOTION.pressScale,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        scale.value = reducedMotion
          ? 1
          : withTiming(pressedScale, {
              duration: MOTION.duration.fast,
              easing: MOTION.easing.out,
            });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, {
          duration: reducedMotion ? 0 : MOTION.duration.fast,
          easing: MOTION.easing.out,
        });
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[styles.content, contentStyle, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { minHeight: 48, justifyContent: 'center' },
});
