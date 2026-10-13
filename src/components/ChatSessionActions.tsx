import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ChevronLeft, Ellipsis, Folder, SquareTerminal, Volume2, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme';
import { StatusBadge } from './app-ui';
import { BottomSheet, ListGroup, ListRow } from './nightfall';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Text } from './ui/text';

const CHAT_STATUS_LABELS: Record<string, string> = {
  blocked: 'Needs you',
  done: 'Done',
  working: 'Working',
  busy: 'Working',
  running: 'Working',
  idle: 'Idle',
  unknown: 'Starting',
};

export interface ChatOption {
  icon: LucideIcon;
  label: string;
  description?: string;
  onPress: () => void;
  /** Renders a switch instead of a plain action. */
  checked?: boolean;
}

/**
 * Nightfall session header: back · title with status pill · subtitle,
 * then Stop/Reconnect and a conversation-options sheet.
 */
export function ChatHeader({
  title,
  status,
  online,
  subtitle,
  path,
  onBack,
  actions,
  options,
}: {
  title: string;
  status: string;
  online: boolean;
  subtitle: string;
  path?: string;
  onBack?: () => void;
  actions?: ReactNode;
  options: ChatOption[];
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View className="min-h-[62px] flex-row items-center gap-1 bg-background py-1 pl-1 pr-1.5">
      {onBack ? (
        <Button
          accessibilityLabel="Back to Chats"
          className="size-11 rounded-full px-0"
          size="content"
          variant="ghost"
          onPress={onBack}>
          <ChevronLeft size={22} strokeWidth={2} color={colors.text} />
        </Button>
      ) : <View className="w-2" />}
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="flex-shrink text-[17px] font-semibold leading-[22px]" numberOfLines={1}>{title}</Text>
          <StatusBadge
            status={online ? status : 'offline'}
            label={online ? CHAT_STATUS_LABELS[status] ?? status : 'Offline'}
          />
        </View>
        <Text accessibilityLiveRegion="polite" className="text-[12.5px] leading-[17px] text-text3" numberOfLines={1}>
          {subtitle}
          {path ? ' · ' : ''}
          {path ? <Text className="font-mono text-xs text-text3">{path}</Text> : null}
        </Text>
      </View>
      {actions}
      <Button
        accessibilityLabel="Conversation options"
        className="size-11 rounded-full px-0"
        size="content"
        variant="ghost"
        onPress={() => setOpen(true)}
      >
        <Ellipsis size={21} color={colors.text} />
      </Button>
      <BottomSheet visible={open} title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
        <ListGroup tone="raised" radius={20}>
          {options.map(option => (
            <ListRow
              key={option.label}
              accessibilityRole={option.checked === undefined ? 'button' : 'switch'}
              accessibilityState={option.checked === undefined ? undefined : { checked: option.checked }}
              description={option.description}
              icon={option.icon}
              label={option.label}
              minHeight={58}
              tileBackground={colors.trackOff}
              tileRadius={11}
              tileSize={34}
              trailing={option.checked === undefined ? undefined : (
                <Switch accessibilityLabel={option.label} checked={option.checked} onCheckedChange={option.onPress} />
              )}
              onPress={() => {
                if (option.checked === undefined) setOpen(false);
                option.onPress();
              }}
            />
          ))}
        </ListGroup>
      </BottomSheet>
    </View>
  );
}

/** A compact pill for Stop and Reconnect in the session header. */
export function HeaderPill({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  tone = 'raised',
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'raised' | 'accent';
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className={tone === 'accent' ? 'h-9 min-h-0 rounded-full bg-primary px-3.5' : 'h-9 min-h-0 rounded-full bg-raised px-3.5 active:bg-overlay'}
      disabled={disabled}
      hitSlop={4}
      size="content"
      variant="ghost"
      onPress={onPress}
    >
      <Text className={tone === 'accent' ? 'text-[13px] font-semibold text-primary-foreground' : 'text-[13px] font-semibold'}>{label}</Text>
    </Button>
  );
}

export function ChatSessionActions({
  title,
  subtitle,
  path,
  status,
  online,
  readAloud,
  onToggleReadAloud,
  onStop,
  onReconnect,
  onOpenTerminal,
  onOpenFiles,
  onBack,
  draftSaveError,
}: {
  title: string;
  subtitle: string;
  path?: string;
  status: string;
  online: boolean;
  readAloud: boolean;
  onToggleReadAloud?: () => void;
  onStop: () => Promise<void>;
  onReconnect: () => Promise<void>;
  onOpenTerminal: () => void;
  onOpenFiles?: () => void;
  onBack?: () => void;
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
    <View className="border-b border-line bg-background">
      <ChatHeader
        title={title}
        status={status}
        online={online}
        subtitle={subtitle}
        path={path}
        onBack={onBack}
        actions={(
          <>
            {online && status === 'working' ? (
              <HeaderPill
                accessibilityLabel="Stop agent response"
                disabled={busy}
                label={busy ? 'Stopping…' : 'Stop'}
                onPress={() => {
                  void act(onStop);
                }}
              />
            ) : null}
            {!online ? (
              <HeaderPill
                accessibilityLabel="Reconnect chat"
                disabled={busy}
                label={busy ? 'Reconnecting…' : 'Reconnect'}
                tone="accent"
                onPress={() => {
                  void act(onReconnect);
                }}
              />
            ) : null}
          </>
        )}
        options={[
          ...(onToggleReadAloud ? [{ icon: Volume2, label: 'Read aloud', description: 'Read new replies in this chat aloud', checked: readAloud, onPress: onToggleReadAloud }] : []),
          ...(onOpenFiles ? [{ icon: Folder, label: 'Remote files', description: path || 'Browse this server', onPress: onOpenFiles }] : []),
          { icon: SquareTerminal, label: 'Open terminal', description: 'Attach at this phone’s size', onPress: onOpenTerminal },
        ]}
      />
      {error || draftSaveError ? (
        <Text accessibilityRole="alert" className="px-4 pb-2 text-xs text-blocked">
          {error || draftSaveError}
        </Text>
      ) : null}
    </View>
  );
}
