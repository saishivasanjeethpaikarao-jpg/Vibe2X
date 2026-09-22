import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS, SIZES, THEME, TYPE } from '../../constants/theme';

type Props = { title: string; actionLabel?: string; onAction?: () => void };

export const SectionHeader = React.memo(function SectionHeader({
  title,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
  },
  title: { ...TYPE.section, fontFamily: FONTS.medium, color: THEME.text.primary },
  action: { minHeight: 48, justifyContent: 'center', paddingLeft: SIZES.md },
  actionLabel: { fontFamily: FONTS.medium, fontSize: 13, color: THEME.text.secondary },
});
