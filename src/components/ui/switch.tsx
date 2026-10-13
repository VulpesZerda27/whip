import { cn } from '@/src/lib/utils';
import { nightfallMotion, useTheme } from '@/src/theme';
import * as SwitchPrimitives from '@rn-primitives/switch';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const NATIVE_SWITCH_HIT_SLOP = Platform.select({
  web: undefined,
  default: { top: 10, bottom: 10, left: 6, right: 6 },
});

const TRACK_WIDTH = 48;
const KNOB_SIZE = 22;
const KNOB_OFF = 3;
const KNOB_ON = TRACK_WIDTH - KNOB_SIZE - KNOB_OFF;

/** Nightfall switch: 48 × 28, accent track with an `onAccent` knob when on. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  const { colors } = useTheme();
  const offset = useSharedValue(props.checked ? KNOB_ON : KNOB_OFF);
  useEffect(() => {
    offset.value = withTiming(props.checked ? KNOB_ON : KNOB_OFF, {
      duration: nightfallMotion.switchKnob,
      easing: Easing.bezier(...nightfallMotion.easing),
    });
  }, [offset, props.checked]);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <SwitchPrimitives.Root
      className={cn(
        'h-7 w-12 shrink-0 flex-row items-center rounded-full',
        Platform.select({ web: 'focus-visible:ring-ring/50 peer inline-flex outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed' }),
        props.checked ? 'bg-primary' : 'bg-track-off',
        props.disabled && 'opacity-45',
        className
      )}
      hitSlop={NATIVE_SWITCH_HIT_SLOP}
      {...props}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: KNOB_SIZE / 2,
            backgroundColor: props.checked ? colors.onPrimary : colors.textTertiary,
          },
          knobStyle,
        ]}
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
