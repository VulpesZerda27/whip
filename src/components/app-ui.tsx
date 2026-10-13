import { Check, ChevronLeft, type LucideIcon } from 'lucide-react-native';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  AppState,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { cn } from '@/src/lib/utils';
import { bundledAsset } from '@/src/lib/bundledAsset';
import { statusMotionKind } from '@/src/lib/statusMotion';
import { nightfallMotion, statusColor, statusTint, useTheme } from '@/src/theme';
import {
  operationalErrorDetails,
  recordOperationalDiagnostic,
} from '@/src/services/operationalDiagnostics';
import { hapticPress } from '../services/interactionFeedback';
import { NativeAgentSpinner } from './NativeAgentSpinner';
import { useDecorativeProgress } from '../hooks/useDecorativeProgress';
import { Button } from './ui/button';
import { Text } from './ui/text';

const ReducedMotionContext = createContext(false);
const AgentStatusAnimationContext = createContext(true);
const AGENT_SPINNER_ROTATION_MS = nightfallMotion.spinnerTurnMs;

export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) setReduceMotion(value);
      })
      .catch(error => {
        recordOperationalDiagnostic('warn', 'Application', 'reduced-motion-preference-read-failed', {
          operation: 'isReduceMotionEnabled',
          fallbackUsed: 'animations-enabled',
          ...operationalErrorDetails(error),
        });
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <ReducedMotionContext.Provider value={reduceMotion}>
      {children}
    </ReducedMotionContext.Provider>
  );
}

export function AgentStatusAnimationProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  return (
    <AgentStatusAnimationContext.Provider value={enabled && appActive}>
      {children}
    </AgentStatusAnimationContext.Provider>
  );
}

export function ReinsMark({
  size,
  accessibilityLabel,
}: {
  size: number;
  accessibilityLabel?: string;
}) {
  const { isDark } = useTheme();
  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      accessible={Boolean(accessibilityLabel)}
      source={bundledAsset(isDark
        ? require('../../assets/reins/reins-icon-dark.png')
        : require('../../assets/reins/reins-icon.png'))}
      resizeMode="contain"
      style={{ height: size, width: size, borderRadius: size / 4 }}
    />
  );
}

/** Single-color “reins” mark used as the Chats dock glyph; tints with the dock state. */
export function ReinsGlyph({ color, size = 22, strokeWidth = 1.9 }: { color?: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.4 4.8a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M12 7.4V10.5M12 10.5c-.6 3.3-5.4 5.4-6.6 10.5M12 10.5c-.2 3.4-2.2 5.8-2.5 10.5M12 10.5c.2 3.4 2.2 5.8 2.5 10.5M12 10.5c.6 3.3 5.4 5.4 6.6 10.5"
        stroke={color ?? 'currentColor'}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

export function HerdrMark({ size, accessibilityLabel }: { size: number; accessibilityLabel?: string }) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible={Boolean(accessibilityLabel)}
      style={[styles.herdrMark, { width: size, height: size, borderRadius: size / 4 }]}>
      <Svg width={size} height={size} viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet">
        <Rect width="512" height="512" fill="#d9dad8" />
        <G fill="#303438" transform="translate(0 512) scale(.1 -.1)" stroke="none">
          <Path d="M2794 3710 c-129 -33 -299 -135 -359 -214 -21 -28 -26 -42 -21 -63 9 -38 154 -178 199 -192 32 -11 41 -9 104 23 171 86 354 70 475 -43 150 -138 150 -379 0 -511 -107 -95 -278 -94 -386 2 l-46 40 -11 -29 c-16 -40 -14 -122 4 -164 60 -144 264 -222 452 -174 360 92 559 494 430 868 -36 103 -81 173 -175 267 -71 72 -100 93 -180 132 -52 26 -127 54 -167 62 -96 21 -230 20 -319 -4z M2183 3695 c-116 -32 -221 -108 -273 -199 -17 -28 -30 -54 -30 -58 0 -4 20 1 45 12 66 28 220 68 294 76 64 7 65 7 137 83 40 41 71 77 69 79 -2 2 -21 8 -42 13 -55 12 -140 10 -200 -6z M2212 3388 c-159 -22 -390 -122 -559 -241 -299 -210 -585 -600 -609 -828 -12 -118 40 -251 125 -318 96 -76 178 -98 426 -116 110 -8 224 -21 254 -29 125 -34 230 -115 272 -211 11 -24 24 -81 30 -127 20 -170 65 -271 166 -374 34 -35 63 -65 63 -67 0 -1 -10 -27 -22 -57 -29 -76 -37 -259 -14 -350 42 -170 158 -318 311 -397 44 -23 98 -46 120 -52 22 -6 45 -14 51 -18 5 -5 15 -48 22 -96 6 -48 14 -92 17 -97 4 -6 415 -10 1131 -10 l1124 0 0 1584 0 1585 -55 -19 c-84 -29 -143 -68 -232 -154 l-83 -78 -54 49 c-111 102 -233 151 -391 160 -113 6 -199 -10 -298 -54 l-60 -27 -26 34 c-37 51 -120 134 -127 128 -3 -4 0 -34 7 -67 17 -89 7 -268 -21 -356 -103 -328 -377 -545 -688 -545 -161 0 -273 41 -373 137 -37 35 -66 75 -85 116 -79 173 -8 407 124 407 44 0 68 -14 117 -66 74 -78 167 -82 238 -9 60 62 72 147 33 231 -42 90 -120 130 -238 122 -50 -4 -85 -14 -131 -37 -89 -45 -122 -52 -176 -40 -92 20 -262 163 -302 253 -11 25 -21 45 -22 45 -1 -1 -30 -6 -65 -11z m-256 -505 c115 -88 129 -102 132 -131 2 -18 -2 -40 -9 -49 -7 -8 -69 -55 -138 -105 -103 -73 -130 -88 -151 -83 -35 8 -51 34 -48 74 3 31 12 42 83 92 44 31 80 61 82 66 1 4 -30 31 -69 58 -39 28 -77 56 -85 63 -18 19 -16 72 4 94 32 35 63 23 199 -79z m528 -88 c23 -24 28 -52 14 -82 l-13 -28 -141 -3 c-130 -2 -142 -1 -158 17 -23 26 -24 66 -1 91 16 18 32 20 151 20 105 0 136 -3 148 -15z" />
        </G>
      </Svg>
    </View>
  );
}

export { hapticPress };

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  className,
  destructive = false,
  disabled = false,
  selected = false,
  tone = 'plain',
  size = 44,
  iconSize = 21,
}: {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress: () => void;
  className?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Shows the `raised` fill used while the control's panel is open. */
  selected?: boolean;
  /** `accent` is the single primary action; `raised` and `card` are tonal circles. */
  tone?: 'plain' | 'raised' | 'card' | 'accent';
  size?: number;
  iconSize?: number;
}) {
  const { colors } = useTheme();
  const IconComponent = icon;
  const accent = tone === 'accent';
  const color = destructive ? colors.error : accent ? colors.onPrimary : colors.text;
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      className={cn(
        'rounded-full active:opacity-80',
        tone === 'raised' && 'bg-raised',
        tone === 'card' && 'bg-card',
        accent && 'bg-primary active:bg-primary',
        selected && !accent && 'bg-raised',
        className,
      )}
      disabled={disabled}
      size="content"
      style={[{ width: size, height: size }, accent ? { boxShadow: ACCENT_BUTTON_SHADOW } : null]}
      variant="ghost"
      onPress={hapticPress(onPress)}>
      <IconComponent size={iconSize} color={color} strokeWidth={accent ? 2.3 : 2} />
    </Button>
  );
}

const ACCENT_BUTTON_SHADOW = [{ offsetX: 0, offsetY: 8, blurRadius: 20, spreadDistance: 0, color: 'rgba(122,162,247,0.25)' }];

export function statusLabelKey(status: string): string {
  return `status.${status}`;
}

/** Status pill: the status color on its 14% tint; idle stays neutral. */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string; agentStatus?: boolean; showIndicator?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const neutral = status === 'idle' || status === 'unknown' || status === 'disconnected' || status === 'offline';
  const color = neutral ? colors.textSecondary : statusPillColor(status, colors);
  return (
    <View
      className={cn('flex-row items-center rounded-lg px-2', className)}
      style={{ paddingVertical: 3, backgroundColor: neutral ? colors.raised : statusTint(color, 0.14) }}>
      <Text className="text-xs font-semibold" style={{ color, lineHeight: 15 }} numberOfLines={1}>
        {label || t(statusLabelKey(status), { defaultValue: status })}
      </Text>
    </View>
  );
}

function statusPillColor(status: string, colors: ReturnType<typeof useTheme>['colors']): string {
  if (status === 'connected' || status === 'active') return colors.done;
  if (status === 'connecting' || status === 'reconnecting' || status === 'syncing' || status === 'running') return colors.working;
  if (status === 'error' || status === 'failed') return colors.blocked;
  if (status === 'waiting') return colors.warning;
  return statusColor(status, colors);
}

/** Small status dot (host rail, session tabs, dock badge). */
export function StatusDot({ color, size = 8, ring }: { color: string; size?: number; ring?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        ...(ring ? { borderWidth: 2, borderColor: ring, width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 } : null),
      }}
    />
  );
}

/**
 * Nightfall agent glyphs: working = ring spinner, blocked = dot with a
 * pulsing ring, done = check, idle/unknown = hollow ring.
 */
export function AnimatedAgentStatusGlyph({
  status,
  color,
  size = 18,
}: {
  status: string;
  color: string;
  size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const animationsEnabled = useContext(AgentStatusAnimationContext);
  const spins = statusMotionKind(status) === 'spin';
  const box = { width: size, height: size };
  if (spins) {
    const ring = Math.round(size * 16 / 18);
    return (
      <View className="items-center justify-center" style={box}>
        <NativeAgentSpinner
          color={color}
          durationMs={AGENT_SPINNER_ROTATION_MS}
          enabled={animationsEnabled && !reduceMotion}
          size={ring}
        />
      </View>
    );
  }
  if (status === 'blocked' || status === 'waiting') {
    return (
      <View className="items-center justify-center" style={box}>
        <PulsingDot color={color} size={Math.max(6, Math.round(size * 10 / 18))} animate={animationsEnabled && !reduceMotion} />
      </View>
    );
  }
  if (status === 'done') {
    return (
      <View className="items-center justify-center" style={box}>
        <Check color={color} size={size} strokeWidth={2.4} />
      </View>
    );
  }
  const ringSize = Math.max(6, Math.round(size * 10 / 18));
  return (
    <View className="items-center justify-center" style={box}>
      <View style={{ width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderWidth: 2, borderColor: color }} />
    </View>
  );
}

/** Solid dot whose ring grows 0→8 px and fades, 1.8 s. Static under reduced motion. */
export function PulsingDot({ color, size = 10, animate = true }: { color: string; size?: number; animate?: boolean }) {
  const reduceMotion = useReducedMotion();
  const animationsEnabled = useContext(AgentStatusAnimationContext);
  const enabled = animate && animationsEnabled && !reduceMotion;
  const progress = useDecorativeProgress(enabled, nightfallMotion.pulseMs, false);
  const ringStyle = useAnimatedStyle(() => {
    const phase = enabled ? progress.value : 1;
    // CSS keyframes: grow over the first 70%, then rest.
    const grow = Math.min(1, phase / 0.7);
    return {
      opacity: enabled ? 0.6 * (1 - grow) : 0,
      transform: [{ scale: 1 + (grow * 16) / size }],
    };
  }, [enabled, size]);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ringStyle]}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

/** 40 px status medallion: the glyph on its status tint (idle sits on `raised`). */
export function AgentStatusMedallion({
  accessibilityLabel,
  status,
  color,
  icon: IconComponent,
  children,
  size = 40,
  glyphSize = 18,
  tint,
}: {
  accessibilityLabel: string;
  status: string;
  color: string;
  connected?: boolean;
  icon?: LucideIcon;
  children?: ReactNode;
  size?: number;
  glyphSize?: number;
  tint?: string;
}) {
  const { colors } = useTheme();
  const neutral = status === 'idle' || status === 'unknown';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: tint ?? (neutral ? colors.raised : statusTint(color, 0.14)) }}>
      {children || (IconComponent
        ? <IconComponent color={color} size={glyphSize} strokeWidth={2} />
        : <AnimatedAgentStatusGlyph status={status} color={color} size={glyphSize} />)}
    </View>
  );
}

export function AnimatedEntrance({ children, delay = 0, className, distance = 10 }: { children: ReactNode; delay?: number; className?: string; distance?: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withTiming(1, {
      duration: nightfallMotion.screenEnter.duration,
      easing: Easing.bezier(...nightfallMotion.easing),
    }));
    return () => cancelAnimation(progress);
  }, [delay, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: distance * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      className={className}
      style={animatedStyle}>
      {children}
    </Animated.View>
  );
}

export function useReducedMotion() {
  return useContext(ReducedMotionContext);
}

/** Nightfall app bar for pushed routes: back 44 · title 17/600 · optional mono subtitle. */
export function ScreenHeader({ title, subtitle, left, right, monoSubtitle = false }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; monoSubtitle?: boolean }) {
  return (
    <View className="min-h-[62px] flex-row items-center bg-background px-2 py-1">
      {left ? <View className="mr-1">{left}</View> : <View className="w-2" />}
      <View className="min-w-0 flex-1">
        <Text className="text-[17px] font-semibold leading-[22px]" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text className={cn('text-xs leading-4 text-text3', monoSubtitle && 'font-mono')} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View className="ml-1 flex-row items-center">{right}</View> : null}
    </View>
  );
}

export function BackButton({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: () => void }) {
  return <IconButton icon={ChevronLeft} iconSize={22} accessibilityLabel={accessibilityLabel} onPress={onPress} />;
}

const styles = StyleSheet.create({
  herdrMark: {
    overflow: 'hidden',
  },
});
