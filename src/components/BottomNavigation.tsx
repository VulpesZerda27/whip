import { Server, Settings } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DOCK_BOTTOM_OFFSET, DOCK_ITEM_GAP, DOCK_ITEM_HEIGHT, DOCK_ITEM_WIDTH, DOCK_PADDING } from '../lib/floatingChrome';
import { cn } from '../lib/utils';
import { nightfallMotion, nightfallShadows, useTheme } from '../theme';
import type { AppTab } from '../types';
import { hapticPress, ReinsGlyph, useReducedMotion } from './app-ui';
import { Button } from './ui/button';

export type DockBadge = 'blocked' | 'done' | null;

const items = [
  { tab: 'chats', labelKey: 'nav.chats', icon: 'reins' },
  { tab: 'hosts', labelKey: 'nav.hosts', icon: Server },
  { tab: 'more', labelKey: 'nav.settings', icon: Settings },
] as const;

const STEP = DOCK_ITEM_WIDTH + DOCK_ITEM_GAP;
const ICON_SIZE = 22;
const easing = Easing.bezier(...nightfallMotion.easing);
// The pill's leading edge reaches the new tab first and the trailing edge
// follows, so it stretches toward the tab and settles into it.
const LEADING_EDGE = { duration: 260, easing };
const TRAILING_EDGE = { duration: 420, easing };

function dockIndex(tab: AppTab) {
  return items.findIndex(item => item.tab === tab || (item.tab === 'chats' && tab === 'chat'));
}

/** Nightfall dock: a floating pill of fixed-width icons; an accent pill stretches and slides to the active one. */
export function BottomNavigation({
  activeTab,
  onSelect,
  chatsBadge = null,
}: {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
  chatsBadge?: DockBadge;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const index = dockIndex(activeTab);
  // Pill edges in item units: start is the left edge, end the right edge.
  const start = useSharedValue(Math.max(0, index));
  const end = useSharedValue(Math.max(0, index));
  useEffect(() => {
    if (index < 0) return;
    if (reduceMotion) {
      start.value = index;
      end.value = index;
      return;
    }
    const forward = index > start.value;
    start.value = withTiming(index, forward ? TRAILING_EDGE : LEADING_EDGE);
    end.value = withTiming(index, forward ? LEADING_EDGE : TRAILING_EDGE);
  }, [end, index, reduceMotion, start]);
  const pillStyle = useAnimatedStyle(() => ({
    left: DOCK_PADDING + start.value * STEP,
    width: DOCK_ITEM_WIDTH + (end.value - start.value) * STEP,
  }));
  // Keeps the on-accent icons inside the pill aligned with the dock, so the
  // icon colour switches exactly where the pill edge passes over it.
  const pillIconsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -start.value * STEP }],
  }));
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 z-30 items-center"
      style={{ bottom: DOCK_BOTTOM_OFFSET + bottom }}>
      <View
        accessibilityRole="tablist"
        className="flex-row bg-raised"
        style={{
          gap: DOCK_ITEM_GAP,
          padding: DOCK_PADDING,
          borderRadius: 32,
          borderWidth: 1,
          borderColor: 'rgba(192,202,245,0.07)',
          boxShadow: nightfallShadows.dock,
        }}>
        {items.map((item, itemIndex) => {
          const active = itemIndex === index;
          const label = t(item.labelKey);
          const badge = item.tab === 'chats' && !active ? chatsBadge : null;
          return (
            <Button
              key={item.tab}
              accessibilityLabel={badge ? t(`nav.badge.${badge}`, { tab: label }) : label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={cn('min-h-0 min-w-0 rounded-full px-0', active ? 'active:bg-transparent' : 'active:bg-overlay')}
              size="content"
              style={{ width: DOCK_ITEM_WIDTH, height: DOCK_ITEM_HEIGHT }}
              variant="ghost"
              onPress={hapticPress(() => onSelect(item.tab))}>
              <DockGlyph color={colors.textTertiary} icon={item.icon} />
              {badge ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 14,
                    width: 13,
                    height: 13,
                    borderRadius: 6.5,
                    borderWidth: 2,
                    borderColor: colors.raised,
                    backgroundColor: badge === 'blocked' ? colors.blocked : colors.done,
                  }}
                />
              ) : null}
            </Button>
          );
        })}
        {index >= 0 ? (
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            className="bg-primary"
            style={[{ position: 'absolute', top: DOCK_PADDING, height: DOCK_ITEM_HEIGHT, borderRadius: DOCK_ITEM_HEIGHT / 2, overflow: 'hidden' }, pillStyle]}>
            <Animated.View style={[{ position: 'absolute', top: 0, left: 0, flexDirection: 'row', gap: DOCK_ITEM_GAP }, pillIconsStyle]}>
              {items.map(item => (
                <View key={item.tab} className="items-center justify-center" style={{ width: DOCK_ITEM_WIDTH, height: DOCK_ITEM_HEIGHT }}>
                  <DockGlyph color={colors.onPrimary} icon={item.icon} />
                </View>
              ))}
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function DockGlyph({ icon: Icon, color }: { icon: (typeof items)[number]['icon']; color: string }) {
  return Icon === 'reins'
    ? <ReinsGlyph color={color} size={ICON_SIZE} />
    : <Icon color={color} size={ICON_SIZE} strokeWidth={1.9} />;
}
