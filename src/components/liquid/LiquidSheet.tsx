import React from 'react';
import { Modal, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SIZES, THEME } from '../../constants/theme';
import { GlassSurface } from './GlassSurface';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardOffset?: number;
  accessibilityLabel?: string;
};

export function LiquidSheet({
  visible,
  onClose,
  children,
  style,
  keyboardOffset = 0,
  accessibilityLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
        />
        <GlassSurface
          strength="strong"
          style={[
            styles.sheet,
            {
              bottom: keyboardOffset,
              paddingBottom: keyboardOffset > 0 ? SIZES.lg : insets.bottom + SIZES.lg,
            },
            style,
          ]}
          accessibilityLabel={accessibilityLabel}
        >
          <View style={styles.handle} />
          {children}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.66)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    maxHeight: '82%',
    paddingTop: SIZES.sm,
    paddingHorizontal: SIZES.md,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    borderBottomWidth: 0,
    backgroundColor: THEME.surface.glassStrong,
  },
  handle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: THEME.text.disabled,
    marginBottom: SIZES.md,
  },
});
