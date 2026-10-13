import { View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useDecorativeProgress } from '../hooks/useDecorativeProgress';
import { useTheme } from '../theme';
import { useReducedMotion } from './app-ui';

const BREATH_MS = 900;

function useBreathingStyle(enabled: boolean) {
  const reduceMotion = useReducedMotion();
  const progress = useDecorativeProgress(enabled && !reduceMotion, BREATH_MS);
  return useAnimatedStyle(
    () => ({ opacity: reduceMotion ? 0.7 : 0.45 + progress.value * 0.4 }),
    [reduceMotion],
  );
}

function Bar({ width, height = 12, color, radius = 6 }: { width: DimensionValue; height?: number; color: string; radius?: number }) {
  return <View style={{ width, height, borderRadius: radius, backgroundColor: color }} />;
}

/**
 * Placeholder conversation shaped like the real chat (prompt bubble, reply
 * lines, tool row), anchored to the bottom where the latest messages land.
 */
export function ChatSkeleton({
  label = 'Loading conversation',
  active = true,
}: {
  label?: string;
  active?: boolean;
}) {
  const { colors } = useTheme();
  const style = useBreathingStyle(active);
  return (
    <View
      testID="chat-skeleton"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      pointerEvents="none"
      className="flex-1 justify-end px-4 pb-4"
    >
      <Animated.View style={style} className="gap-3">
        <View className="items-end">
          <View
            className="w-[62%] gap-2 px-3.5 py-3"
            style={{ backgroundColor: colors.selection, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 6, borderBottomLeftRadius: 20 }}
          >
            <Bar width="92%" color={colors.trackOff} />
            <Bar width="58%" color={colors.trackOff} />
          </View>
        </View>
        <View className="gap-2.5 pr-10 pt-1">
          <Bar width="96%" color={colors.trackOff} />
          <Bar width="88%" color={colors.trackOff} />
          <Bar width="64%" color={colors.trackOff} />
        </View>
        <View className="h-12 flex-row items-center gap-2.5 rounded-2xl px-3" style={{ backgroundColor: colors.card }}>
          <Bar width={17} height={17} radius={5} color={colors.trackOff} />
          <Bar width="46%" color={colors.trackOff} />
        </View>
        <View className="items-end pt-2">
          <View
            className="w-[44%] px-3.5 py-3"
            style={{ backgroundColor: colors.selection, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 6, borderBottomLeftRadius: 20 }}
          >
            <Bar width="80%" color={colors.trackOff} />
          </View>
        </View>
        <View className="gap-2.5 pr-14 pt-1">
          <Bar width="90%" color={colors.trackOff} />
          <Bar width="72%" color={colors.trackOff} />
        </View>
      </Animated.View>
    </View>
  );
}

/** Placeholder rows for the attention queue while servers reconnect. */
export function ChatRowSkeleton({ count = 3 }: { count?: number }) {
  const { colors } = useTheme();
  const style = useBreathingStyle(true);
  return (
    <View
      testID="chat-row-skeleton"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading chats"
      pointerEvents="none"
      className="overflow-hidden rounded-3xl bg-card"
    >
      <Animated.View style={style}>
        {Array.from({ length: count }, (_, index) => (
          <View
            key={index}
            className="min-h-[72px] flex-row items-center gap-3.5 py-3 pl-3.5 pr-4"
            style={index ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}
          >
            <View className="size-10 rounded-full" style={{ backgroundColor: colors.trackOff }} />
            <View className="min-w-0 flex-1 gap-2">
              <Bar width={index === 1 ? '48%' : '62%'} height={14} radius={7} color={colors.trackOff} />
              <Bar width={index === 2 ? '54%' : '40%'} height={10} radius={5} color={colors.trackOff} />
            </View>
            <Bar width={44} height={10} radius={5} color={colors.trackOff} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
