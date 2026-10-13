import { useColorScheme } from 'react-native';

import type { TerminalSessionStatus } from './terminalSessions';

export const githubLightPalette = {
  canvas: '#FFFFFF',
  canvasInset: '#F6F8FA',
  surfaceRaised: '#EAEEF2',
  border: '#D0D7DE',
  foreground: '#24292F',
  foregroundMuted: '#57606A',
  foregroundSubtle: '#6E7781',
  foregroundDisabled: '#8C959F',
  accent: '#0969DA',
  green: '#1A7F37',
  red: '#CF222E',
  attention: '#9A6700',
} as const;

export const lightColors = {
  canvas: githubLightPalette.canvas,
  sidebar: githubLightPalette.canvasInset,
  surface: githubLightPalette.canvasInset,
  surfaceRaised: githubLightPalette.surfaceRaised,
  divider: githubLightPalette.border,
  text: githubLightPalette.foreground,
  textSecondary: githubLightPalette.foregroundMuted,
  textTertiary: githubLightPalette.foregroundSubtle,
  primary: githubLightPalette.accent,
  onPrimary: githubLightPalette.canvas,
  disabled: githubLightPalette.foregroundDisabled,
  input: githubLightPalette.canvas,
  scrim: '#1B1F2466',
  link: githubLightPalette.accent,
  // Working must never share Done's color (Nightfall status fix).
  working: '#1B7C83',
  blocked: githubLightPalette.red,
  done: githubLightPalette.green,
  idle: githubLightPalette.foregroundSubtle,
  unknown: githubLightPalette.attention,
  warning: githubLightPalette.attention,
  error: githubLightPalette.red,
  // Nightfall layers, mapped onto GitHub Light until a light Nightfall exists.
  sunken: githubLightPalette.canvasInset,
  card: githubLightPalette.canvasInset,
  raised: githubLightPalette.surfaceRaised,
  overlay: githubLightPalette.canvas,
  line: githubLightPalette.border,
  selection: '#DDF4FF',
  trackOff: githubLightPalette.border,
  grabber: '#AFB8C1',
  decor: githubLightPalette.foregroundDisabled,
  blockedRow: '#FFF5F6',
  flash: '#EEF5FF',
  magenta: '#8250DF',
} as const;

export const tokyoNightPalette = {
  background: '#1A1B26',
  backgroundDark: '#16161E',
  backgroundHighlight: '#292E42',
  surface: '#24283B',
  surfaceRaised: '#414868',
  foreground: '#C0CAF5',
  foregroundDark: '#A9B1D6',
  comment: '#545C7E',
  black: '#15161E',
  red: '#F7768E',
  green: '#9ECE6A',
  yellow: '#E0AF68',
  blue: '#7AA2F7',
  magenta: '#BB9AF7',
  cyan: '#7DCFFF',
  orange: '#FF9E64',
  selection: '#283457',
  brightRed: '#FF899D',
  brightGreen: '#9FE044',
  brightYellow: '#FABA4A',
  brightBlue: '#8DB0FF',
  brightMagenta: '#C7A9FF',
  brightCyan: '#A4DAFF',
} as const;

/**
 * Nightfall: Tokyo Night as tonal layers instead of outlines, one blue accent,
 * and a status system where every agent state has its own color.
 */
export const nightfall = {
  // surfaces
  canvas: '#1A1B26',
  sunken: '#16161E',
  card: '#1F2335',
  raised: '#24283B',
  overlay: '#292E42',
  line: '#292E42',
  selection: '#283457',
  trackOff: '#2F3549',
  grabber: '#414868',
  // text
  text: '#C0CAF5',
  text2: '#A9B1D6',
  text3: '#8089B3', // captions, placeholders, line numbers (4.6:1 on card)
  decor: '#565F89', // chevrons and idle ring only, never text
  // accent
  accent: '#7AA2F7',
  onAccent: '#16161E',
  // status
  working: '#7DCFFF', // was green; now distinct from done
  blocked: '#F7768E',
  done: '#9ECE6A',
  idle: '#565F89',
  unknown: '#E0AF68',
  warning: '#E0AF68',
  error: '#F7768E',
  magenta: '#BB9AF7',
  // derived
  blockedRow: '#2C283A',
  flash: '#2A324C',
  diffAddBg: 'rgba(158,206,106,0.09)',
  diffAddFg: '#B4DC8A',
  diffDelBg: 'rgba(247,118,142,0.09)',
  diffDelFg: '#F6A1B1',
  diffSelectBg: 'rgba(122,162,247,0.22)',
  searchHit: 'rgba(224,175,104,0.30)',
  searchHitCurrent: '#E0AF68',
  scrimSheet: 'rgba(8,9,14,0.62)',
  scrimDialog: 'rgba(8,9,14,0.66)',
} as const;

export const darkColors = {
  canvas: nightfall.canvas,
  sidebar: nightfall.sunken,
  surface: nightfall.raised,
  surfaceRaised: nightfall.overlay,
  divider: nightfall.line,
  text: nightfall.text,
  textSecondary: nightfall.text2,
  textTertiary: nightfall.text3,
  primary: nightfall.accent,
  onPrimary: nightfall.onAccent,
  disabled: nightfall.grabber,
  input: nightfall.card,
  scrim: nightfall.scrimSheet,
  link: nightfall.accent,
  working: nightfall.working,
  blocked: nightfall.blocked,
  done: nightfall.done,
  idle: nightfall.idle,
  unknown: nightfall.unknown,
  warning: nightfall.warning,
  error: nightfall.error,
  sunken: nightfall.sunken,
  card: nightfall.card,
  raised: nightfall.raised,
  overlay: nightfall.overlay,
  line: nightfall.line,
  selection: nightfall.selection,
  trackOff: nightfall.trackOff,
  grabber: nightfall.grabber,
  decor: nightfall.decor,
  blockedRow: nightfall.blockedRow,
  flash: nightfall.flash,
  magenta: nightfall.magenta,
} as const;

export type ThemeColors = { [Key in keyof typeof lightColors]: string };

export const terminalColors = {
  canvas: tokyoNightPalette.background,
  panel: tokyoNightPalette.backgroundDark,
  panelRaised: tokyoNightPalette.surface,
  line: tokyoNightPalette.backgroundHighlight,
  text: tokyoNightPalette.foreground,
  muted: tokyoNightPalette.foregroundDark,
  accent: tokyoNightPalette.blue,
  warning: tokyoNightPalette.yellow,
  working: darkColors.working,
  blocked: darkColors.blocked,
  done: darkColors.done,
  idle: darkColors.idle,
  unknown: darkColors.unknown,
};

// Compatibility for terminal-only components. Management UI should use useTheme().
export const colors = {
  ink: tokyoNightPalette.backgroundDark,
  panel: terminalColors.panel,
  panelRaised: terminalColors.panelRaised,
  line: terminalColors.line,
  text: terminalColors.text,
  muted: terminalColors.muted,
  acid: terminalColors.accent,
  warning: terminalColors.warning,
  working: terminalColors.working,
  blocked: terminalColors.blocked,
  done: terminalColors.done,
  idle: terminalColors.idle,
  unknown: terminalColors.unknown,
};

export function resolveTheme(scheme: 'light' | 'dark' | 'unspecified' | null | undefined): ThemeColors {
  return scheme === 'light' ? lightColors : darkColors;
}

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { colors: resolveTheme(scheme), isDark, scheme: isDark ? 'dark' as const : 'light' as const };
}

export function statusColor(status: string, palette: ThemeColors | typeof colors = colors): string {
  const key = status as 'working' | 'blocked' | 'done' | 'idle' | 'unknown';
  return palette[key] || palette.unknown;
}

export function terminalStatusColor(
  status: TerminalSessionStatus,
  palette: ThemeColors | typeof colors = colors,
): string {
  if (status === 'connected') return palette.done;
  if (status === 'connecting') return palette.working;
  if (status === 'error') return palette.blocked;
  return palette.idle;
}

/** A healthy terminal must not mask the Herdr agent state shown by a tab. */
export function sessionTabStatusColor(
  agentStatus: string,
  terminalStatus?: TerminalSessionStatus,
  palette: ThemeColors | typeof colors = colors,
): string {
  return terminalStatus && terminalStatus !== 'connected'
    ? terminalStatusColor(terminalStatus, palette)
    : statusColor(agentStatus, palette);
}

export function sessionTabGlassStyle(active: boolean, palette: ThemeColors) {
  return {
    backgroundColor: colorWithAlpha(active ? palette.primary : palette.surface, active ? 'D6' : 'B8'),
    borderColor: colorWithAlpha(active ? palette.onPrimary : palette.text, active ? '47' : '29'),
  };
}

export function appGlassControlStyle(active: boolean, palette: ThemeColors) {
  return {
    backgroundColor: 'transparent',
    borderColor: colorWithAlpha(active ? palette.primary : palette.text, active ? 'D6' : '47'),
  };
}

export function latestButtonStyle(palette: ThemeColors) {
  return {
    backgroundColor: colorWithAlpha(palette.surface, '80'),
    borderColor: colorWithAlpha(palette.primary, '66'),
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 8,
        spreadDistance: 0,
        color: colorWithAlpha(palette.primary, '59'),
      },
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 20,
        spreadDistance: 2,
        color: colorWithAlpha(palette.primary, '33'),
      },
    ],
  };
}

export function colorWithAlpha(color: string, alpha: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
};

export const nightfallRadii = {
  tag: 6,
  badge: 8,
  key: 12,
  tile: 13,
  input: 16,
  group: 20,
  card: 24,
  prompt: 28,
  sheet: 30,
  full: 999,
} as const;

export const nightfallShadows = {
  dock: [{ offsetX: 0, offsetY: 14, blurRadius: 34, spreadDistance: 0, color: 'rgba(0,0,0,0.55)' }],
  toast: [{ offsetX: 0, offsetY: 16, blurRadius: 36, spreadDistance: 0, color: 'rgba(0,0,0,0.5)' }],
  headsUp: [{ offsetX: 0, offsetY: 18, blurRadius: 40, spreadDistance: 0, color: 'rgba(0,0,0,0.55)' }],
  accentButton: [{ offsetX: 0, offsetY: 10, blurRadius: 24, spreadDistance: 0, color: 'rgba(122,162,247,0.22)' }],
  promptCard: [{ offsetX: 0, offsetY: -14, blurRadius: 40, spreadDistance: 0, color: 'rgba(0,0,0,0.45)' }],
  floatingBar: [{ offsetX: 0, offsetY: 12, blurRadius: 30, spreadDistance: 0, color: 'rgba(0,0,0,0.45)' }],
  sheet: [{ offsetX: 0, offsetY: -10, blurRadius: 40, spreadDistance: 0, color: 'rgba(0,0,0,0.4)' }],
};

export const nightfallMotion = {
  easing: [0.2, 0.8, 0.2, 1] as const,
  press: { icon: 0.92, button: 0.97, card: 0.985, duration: 150 },
  screenEnter: { duration: 280, rise: 10 },
  push: { duration: 300, slide: 26 },
  dock: 300,
  sheet: { duration: 320, scrim: 250 },
  dialog: { duration: 250, scaleFrom: 0.94, scrim: 200 },
  toast: { duration: 300, rise: 14, visibleMs: 2800, visibleWithActionMs: 4600 },
  switchKnob: 220,
  flashMs: 1700,
  spinnerTurnMs: 700,
  pulseMs: 1800,
  longPressMs: 520,
} as const;

/** Status tint used behind glyphs, chips and tiles. */
export function statusTint(hex: string, alpha = 0.14): string {
  if (!/^#[\da-f]{6}$/i.test(hex)) return hex;
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
