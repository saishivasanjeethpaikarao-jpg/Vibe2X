import { Easing } from 'react-native-reanimated';

/** Liquid Vibe semantic tokens. */
export const THEME = {
  background: {
    primary: '#070708',
    elevated: '#0D0D11',
    amoled: '#000000',
    scrim: 'rgba(7, 7, 8, 0.78)',
  },
  surface: {
    glass: 'rgba(24, 22, 30, 0.62)',
    glassStrong: 'rgba(24, 22, 30, 0.84)',
    raised: '#15131A',
    interactive: '#1B1822',
    selected: 'rgba(112, 0, 255, 0.18)',
  },
  border: {
    glass: 'rgba(255, 255, 255, 0.09)',
    subtle: 'rgba(255, 255, 255, 0.06)',
    focus: 'rgba(208, 0, 255, 0.64)',
  },
  text: {
    primary: '#F8F7FA',
    secondary: '#A7A3AD',
    disabled: '#69666F',
    inverse: '#09070C',
  },
  accent: {
    primary: '#7000FF',
    secondary: '#D000FF',
    softPrimary: 'rgba(112, 0, 255, 0.16)',
    softSecondary: 'rgba(208, 0, 255, 0.14)',
    danger: '#FF5B6E',
    softDanger: 'rgba(255, 91, 110, 0.15)',
  },
  player: {
    progressTrack: 'rgba(248, 247, 250, 0.18)',
    progressFill: '#F8F7FA',
  },
} as const;

export const MOTION = {
  duration: { fast: 150, standard: 220, sheet: 300, launchFirst: 1400, launchRepeat: 520 },
  easing: {
    out: Easing.bezier(0.22, 1, 0.36, 1),
    standard: Easing.bezier(0.4, 0, 0.2, 1),
  },
  pressScale: 0.975,
} as const;

export const TYPE = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  section: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

/** Compatibility aliases for existing screens during phased migration. */
export const COLORS = {
  background: THEME.background.primary,
  surface: THEME.background.elevated,
  surfaceLight: THEME.surface.interactive,
  glass: THEME.surface.glass,
  surfaceRaised: THEME.surface.raised,
  hairline: THEME.border.subtle,
  glassBorder: THEME.border.glass,
  text: {
    primary: THEME.text.primary,
    secondary: THEME.text.secondary,
    muted: THEME.text.disabled,
  },
  accent: {
    magenta: THEME.accent.secondary,
    magentaGlow: THEME.accent.softSecondary,
    violet: THEME.accent.primary,
    violetGlow: THEME.accent.softPrimary,
    red: THEME.accent.danger,
    redGlow: THEME.accent.softDanger,
  },
  player: THEME.player,
} as const;

export const SIZES = {
  /**
   * Clearance a scrolling screen must leave at the bottom so the last row is
   * never trapped under the tab bar + mini player.
   */
  bottomInset: 158,
  touchTarget: 48,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  radius: {
    sm: 10,
    md: 16,
    lg: 24,
    pill: 999,
  }
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const SHADOWS = {
  floating: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    elevation: 12,
  },
  ambient: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  glass: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    elevation: 12,
  },
};
