import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Timer, X } from 'lucide-react-native';
import { COLORS, SIZES, FONTS, THEME } from '../../constants/theme';
import { LiquidSheet } from '../liquid/LiquidSheet';

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
  let remaining = '';
  if (expiration) {
    const diff = Math.max(0, Math.ceil((expiration - Date.now()) / 60000));
    remaining = ` (Ends in ${diff}m)`;
  }

  return (
    <LiquidSheet visible={visible} onClose={onClose} accessibilityLabel="Sleep timer">
      <View>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Sleep timer</Text>
            {!!expiration && (
              <Text style={styles.subtitle}>
                Timer active{remaining}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sleep timer"
          >
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
            accessibilityRole="button"
            accessibilityLabel={`Set sleep timer to ${opt.label}`}
          >
            <View style={styles.rowIcon}>
              <Timer color={COLORS.text.primary} size={20} />
            </View>
            <Text style={styles.rowLabel}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </LiquidSheet>
  );
}

const styles = StyleSheet.create({
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
  closeButton: {
    width: 48,
    height: 48,
    marginTop: -SIZES.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 56,
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
    backgroundColor: THEME.surface.interactive,
  },
  rowLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
  },
});
