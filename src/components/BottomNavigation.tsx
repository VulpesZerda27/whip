import { MessageCircle, Server, Settings } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_NAVIGATION_BASE_HEIGHT } from '../lib/floatingChrome';
import type { AppTab } from '../types';
import { hapticPress } from './app-ui';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Text } from './ui/text';

const items = [
  { tab: 'chats', labelKey: 'nav.chats', icon: MessageCircle },
  { tab: 'hosts', labelKey: 'nav.hosts', icon: Server },
  { tab: 'more', labelKey: 'nav.settings', icon: Settings },
] as const;

export function BottomNavigation({
  activeTab,
  onSelect,
}: {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  return (
    <View
      className="absolute inset-x-0 bottom-0 z-30 flex-row border-t border-border bg-background"
      style={{
        height: BOTTOM_NAVIGATION_BASE_HEIGHT + bottom,
        paddingBottom: bottom,
      }}
    >
      {items.map(item => (
        <Button
          key={item.tab}
          accessibilityLabel={t(item.labelKey)}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === item.tab }}
          className="h-full flex-1 flex-col gap-1 rounded-none"
          size="content"
          variant="ghost"
          onPress={hapticPress(() => onSelect(item.tab))}
        >
          <Icon
            as={item.icon}
            size={23}
            className={
              activeTab === item.tab ? 'text-primary' : 'text-muted-foreground'
            }
          />
          <Text
            className={
              activeTab === item.tab
                ? 'text-xs font-semibold text-primary'
                : 'text-xs text-muted-foreground'
            }
          >
            {t(item.labelKey)}
          </Text>
        </Button>
      ))}
    </View>
  );
}
