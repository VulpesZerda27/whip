import { useRef, useState } from 'react';
import { View } from 'react-native';
import { chatStatusLabel } from '../lib/chatInbox';
import { Button } from './ui/button';
import { Text } from './ui/text';

export function ChatSessionActions({
  status,
  online,
  readAloud,
  onToggleReadAloud,
  onStop,
  onReconnect,
  draftSaveError,
}: {
  status: string;
  online: boolean;
  readAloud: boolean;
  onToggleReadAloud?: () => void;
  onStop: () => Promise<void>;
  onReconnect: () => Promise<void>;
  draftSaveError?: string | null;
}) {
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
    <View className="mb-2 gap-1 rounded-2xl bg-background px-3 py-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text
          accessibilityLiveRegion="polite"
          className="mr-auto text-sm font-semibold"
        >
          {chatStatusLabel(status, online)}
        </Text>
        {online && status === 'working' ? (
          <Button
            size="sm"
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
        {onToggleReadAloud ? (
          <Button
            size="sm"
            variant="secondary"
            accessibilityLabel="Read responses aloud"
            accessibilityRole="switch"
            accessibilityState={{ checked: readAloud }}
            onPress={onToggleReadAloud}
          >
            <Text>Read aloud: {readAloud ? 'On' : 'Off'}</Text>
          </Button>
        ) : null}
      </View>
      {!online ? (
        <Text className="text-xs text-muted-foreground">
          Your agent keeps running. Your draft stays here until you reconnect.
        </Text>
      ) : null}
      {status === 'blocked' && online ? (
        <Text className="text-xs text-muted-foreground">
          Answer the question or approval below the latest response.
        </Text>
      ) : null}
      {error || draftSaveError ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          {error || draftSaveError}
        </Text>
      ) : null}
    </View>
  );
}
