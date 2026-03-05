import { Platform } from 'react-native';

export const theme = {
  colors: {
    bg: '#F3F6F2',
    bgSoft: '#E8F0E6',
    bgDeep: '#D8E5D6',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF3EC',
    textPrimary: '#14221C',
    textSecondary: '#3F5148',
    textMuted: '#6A7B73',
    border: '#C9D7CA',
    brand: '#1E8E5A',
    brandStrong: '#0F6A40',
    accent: '#F28B2D',
    success: '#168953',
    danger: '#C63D35',
    shadow: '#122219',
    overlay: 'rgba(18, 34, 25, 0.45)',
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 24,
    xl: 34,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 44,
  },
  typography: {
    // Inter is loaded via google fonts on web; falls back to system fonts on native
    display: Platform.select({
      ios: 'System',
      android: 'sans-serif-medium',
      default: 'Outfit, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    }),
    body: Platform.select({
      ios: 'System',
      android: 'sans-serif',
      default: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    }),
    mono: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    }),
  },
};

export const shadows = {
  card: {
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  float: {
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 8,
  },
  sm: {
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
};
