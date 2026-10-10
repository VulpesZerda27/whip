import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Ellipsis } from 'lucide-react-native';
import { useTheme } from '../theme';
import { chatStatusLabel } from '../lib/chatInbox';
import { Button } from './ui/button';
import { Text } from './ui/text';

export function ChatSessionActions({
  title,
  subtitle,
  status,
  online,
  readAloud,
  onToggleReadAloud,
  onStop,
  onReconnect,
  onOpenTerminal,
  draftSaveError,
}: {
  title: string;
  subtitle: string;
  status: string;
  online: boolean;
  readAloud: boolean;
  onToggleReadAloud?: () => void;
  onStop: () => Promise<void>;
  onReconnect: () => Promise<void>;
  onOpenTerminal: () => void;
  draftSaveError?: string | null;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const act = async (action: () => Promise<void>) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(String(reason));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <View className="border-b border-border bg-background px-3 py-1">
      <View className="min-h-12 flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-semibold leading-5" numberOfLines={1}>{title}</Text>
          <Text accessibilityLiveRegion="polite" className="text-[11px] leading-4 text-muted-foreground" numberOfLines={1}>
            {chatStatusLabel(status, online)} · {subtitle}
          </Text>
        </View>
        {online && status === 'working' ? (
          <Button
            size="sm"
            className="min-h-11"
            variant="outline"
            accessibilityLabel="Stop agent response"
            disabled={busy}
            onPress={() => {
              void act(onStop);
            }}
          >
            <Text>{busy ? 'Stopping…' : 'Stop'}</Text>
          </Button>
        ) : null}
        {!online ? (
          <Button
            size="sm"
            className="min-h-11"
            variant="outline"
            accessibilityLabel="Reconnect chat"
            disabled={busy}
            onPress={() => {
              void act(onReconnect);
            }}
          >
            <Text>{busy ? 'Reconnecting…' : 'Reconnect'}</Text>
          </Button>
        ) : null}
        <Button
          className="size-11 rounded-full px-0"
          variant="ghost"
          accessibilityLabel="Conversation options"
          onPress={() => Alert.alert('Conversation', undefined, [
            ...(onToggleReadAloud ? [{ text: `Read aloud: ${readAloud ? 'On' : 'Off'}`, onPress: onToggleReadAloud }] : []),
            { text: 'Open terminal', onPress: onOpenTerminal },
            { text: 'Cancel', style: 'cancel' },
          ])}
        >
          <Ellipsis size={21} color={colors.text} />
        </Button>
      </View>
      {error || draftSaveError ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          {error || draftSaveError}
        </Text>
      ) : null}
    </View>
  );
}
