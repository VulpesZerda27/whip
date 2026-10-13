import { X } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { chatRowTitle, type ChatHeadsUp } from '../lib/chatList';
import { shortHomePath } from '../lib/paths';
import { nightfallMotion, nightfallShadows, statusColor, statusTint, useTheme } from '../theme';
import { AgentStatusMedallion, hapticPress, useReducedMotion } from './app-ui';
import { Button } from './ui/button';
import { Text } from './ui/text';

const HEADS_UP_VISIBLE_MS = 5600;

/**
 * In-app heads-up for a chat you are not looking at: drops in from the top,
 * opens the chat on tap, and hides itself after 5.6 s.
 */
export function HeadsUpCard({
  event,
  onOpen,
  onDismiss,
}: {
  event: ChatHeadsUp;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { top } = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) {
      progress.value = withTiming(1, { duration: 350, easing: Easing.bezier(...nightfallMotion.easing) });
    }
    const timer = setTimeout(onDismiss, HEADS_UP_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [event.key, onDismiss, progress, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -24 }],
  }));
  const blocked = event.status === 'blocked';
  const name = chatRowTitle(event.row);
  const path = shortHomePath(event.row.thread?.cwd || event.row.agent.cwd);
  const body = [event.row.agent.agent, path].filter(Boolean).join(' · ');
  const color = statusColor(event.status, colors);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
      style={[{ position: 'absolute', top: top + 8, left: 10, right: 10, zIndex: 90 }, style]}>
      <View
        className="flex-row items-center bg-overlay"
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: blocked ? statusTint(colors.blocked, 0.4) : 'rgba(192,202,245,0.08)',
          boxShadow: nightfallShadows.headsUp,
        }}>
        <Pressable
          accessibilityHint={t('headsUp.open')}
          accessibilityRole="button"
          className="min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-3"
          onPress={hapticPress(onOpen)}>
          <AgentStatusMedallion accessibilityLabel={t(`status.${event.status}`)} color={color} status={event.status} />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-baseline gap-2">
              <Text className="flex-shrink text-[15px] font-semibold" numberOfLines={1}>
                {t(blocked ? 'headsUp.needsYou' : 'headsUp.done', { name })}
              </Text>
              <Text className="text-xs text-text3">{t('headsUp.now')}</Text>
            </View>
            <Text className="mt-0.5 text-[13px] text-text2" numberOfLines={1}>{body}</Text>
          </View>
        </Pressable>
        <Button
          accessibilityLabel={t('headsUp.dismiss')}
          className="mr-1.5 size-10 min-h-0 min-w-0 rounded-full"
          size="content"
          variant="ghost"
          onPress={hapticPress(onDismiss)}>
          <X color={colors.textTertiary} size={18} />
        </Button>
      </View>
    </Animated.View>
  );
}
