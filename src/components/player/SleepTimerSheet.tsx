import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Timer, X } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../../constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  expiration: number | null;
  onSetTimer: (minutes: number | null) => void;
};

const OPTIONS = [
  { label: 'Off', minutes: null },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '60 minutes', minutes: 60 },
];

export function SleepTimerSheet({ visible, onClose, expiration, onSetTimer }: Props) {
  const insets = useSafeAreaInsets();

  let remaining = '';
  if (expiration) {
    const diff = Math.max(0, Math.ceil((expiration - Date.now()) / 60000));
    remaining = ` (Ends in ${diff}m)`;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.lg }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Sleep Timer</Text>
            {!!expiration && (
              <Text style={styles.subtitle}>
                Timer active{remaining}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <X color={COLORS.text.secondary} size={22} />
          </TouchableOpacity>
        </View>

        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.label}
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => {
              onSetTimer(opt.minutes);
              onClose();
            }}
          >
            <View style={styles.rowIcon}>
              <Timer color={COLORS.text.primary} size={20} />
            </View>
            <Text style={styles.rowLabel}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    borderTopWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingTop: SIZES.lg,
    paddingHorizontal: SIZES.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SIZES.md,
  },
  headerText: {
    flex: 1,
    marginRight: SIZES.md,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text.primary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.accent.magenta,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm + 4,
    gap: SIZES.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  rowLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
  },
});
