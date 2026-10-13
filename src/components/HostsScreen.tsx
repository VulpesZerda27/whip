import * as Haptics from 'expo-haptics';
import { Bot, CircleAlert, Ellipsis, LockKeyhole, LogIn, LogOut, MessageSquare, Pencil, Plus, Route, Search, Server, SquareTerminal, Trash2, X, Zap } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { orderByConnectionAndAgentStatusPriority } from '@/src/herdQueue';
import { bottomNavigationInset } from '@/src/lib/floatingChrome';
import { DEFAULT_SSH_PORT, hostDisplayName } from '@/src/lib/hostProfiles';
import type { HostRuntimeSummary } from '@/src/lib/hostRuntimeSummary';
import { cn } from '@/src/lib/utils';
import type { LiveHostConnectionStatus } from '@/src/liveHostSessions';
import { reportBackgroundFailure } from '@/src/services/backgroundOperations';
import type { CredentialRecoveryStatus } from '@/src/services/credentialVault';
import { statusTint, useTheme } from '@/src/theme';
import type { HostProfile } from '@/src/types';
import { AnimatedAgentStatusGlyph, hapticPress, IconButton, ReinsMark } from './app-ui';
import { ActionButton, BottomSheet, Chip, IconTile, ListGroup, ListRow, SectionLabel, useToast } from './nightfall';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Text } from './ui/text';

interface Props {
  hosts: HostProfile[];
  connectingHostIds?: string[];
  error: string | null;
  activeHostId?: string | null;
  connectedHostIds?: string[];
  connectionByHostId?: Record<string, LiveHostConnectionStatus | undefined>;
  latencyMsByHostId?: Record<string, number | null | undefined>;
  runtimeByHostId?: Record<string, HostRuntimeSummary | undefined>;
  credentialRecovery: CredentialRecoveryStatus;
  credentialRecoveryBusy: boolean;
  onAdd: () => void;
  /** Connects without leaving Servers; resolves true once the server is ready. */
  onConnect: (host: HostProfile) => Promise<boolean>;
  onOpenChats?: (host: HostProfile, filter?: 'blocked') => void;
  onOpenTerminal: (host: HostProfile) => void;
  onDelete: (host: HostProfile) => void;
  onDisconnect: (host: HostProfile) => void;
  onEdit: (host: HostProfile) => void;
  onUnlockCredentials: () => Promise<boolean>;
}

type CardState = 'connected' | 'reconnecting' | 'error' | 'opening' | 'saved';

function cardState(
  host: HostProfile,
  connection: LiveHostConnectionStatus | undefined,
  connected: boolean,
  connecting: boolean,
): CardState {
  if (connection === 'error') return 'error';
  if (connection === 'reconnecting') return 'reconnecting';
  if (connected || connection === 'ready' || connection === 'connected') return 'connected';
  if (connecting || connection === 'connecting') return 'opening';
  return 'saved';
}

export function sshAddress(host: HostProfile): string {
  return `${host.username}@${host.host}${host.port !== DEFAULT_SSH_PORT ? `:${host.port}` : ''}`;
}

export function HostsScreen({
  hosts,
  connectingHostIds = [],
  error,
  activeHostId,
  connectedHostIds = [],
  connectionByHostId = {},
  latencyMsByHostId = {},
  runtimeByHostId = {},
  credentialRecovery,
  credentialRecoveryBusy,
  onAdd,
  onConnect,
  onOpenChats,
  onOpenTerminal,
  onDelete,
  onDisconnect,
  onEdit,
  onUnlockCredentials,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const toast = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sheetHostId, setSheetHostId] = useState<string | null>(null);
  const connectingHostIdSet = new Set(connectingHostIds);
  const connectedHostIdSet = new Set(connectedHostIds);
  const hostsById = new Map(hosts.map(host => [host.id, host]));
  const stateOf = (host: HostProfile) => cardState(
    host,
    connectionByHostId[host.id],
    connectedHostIdSet.has(host.id),
    connectingHostIdSet.has(host.id),
  );
  const needle = searchOpen ? query.trim().toLowerCase() : '';
  const orderedHosts = orderByConnectionAndAgentStatusPriority(
    hosts,
    host => connectedHostIdSet.has(host.id),
    host => runtimeByHostId[host.id]?.agentStatus ?? 'unknown',
  ).filter(host => !needle || [hostDisplayName(host), sshAddress(host)].some(value => value.toLowerCase().includes(needle)));
  const liveHosts = orderedHosts.filter(host => ['connected', 'reconnecting', 'error'].includes(stateOf(host)));
  const savedHosts = orderedHosts.filter(host => !liveHosts.includes(host));
  const connectedCount = hosts.filter(host => stateOf(host) === 'connected').length;
  const sheetHost = sheetHostId ? hostsById.get(sheetHostId) ?? null : null;

  const connect = (host: HostProfile) => {
    reportBackgroundFailure(onConnect(host).then(ready => {
      if (!ready) return;
      toast.show({
        message: t('hosts.connectedToast', { host: hostDisplayName(host) }),
        action: onOpenChats ? { label: t('hosts.openChats'), onPress: () => onOpenChats(host) } : undefined,
      });
    }), 'host-connect');
  };
  const disconnect = (host: HostProfile) => {
    onDisconnect(host);
    toast.show({
      message: t('hosts.disconnectedToast', { host: hostDisplayName(host) }),
      tone: 'info',
      action: { label: t('common.undo'), onPress: () => connect(host) },
    });
  };
  const openSheet = (host: HostProfile) => {
    reportBackgroundFailure(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 'haptic-feedback');
    setSheetHostId(host.id);
  };

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomNavigationInset(bottom) }}>
        <View className="px-4">
          <View className="h-[60px] flex-row items-center gap-1.5 pl-1">
            <View style={{ borderRadius: 9, borderWidth: 1, borderColor: 'rgba(192,202,245,0.12)', overflow: 'hidden' }}>
              <ReinsMark size={30} />
            </View>
            <Text className="ml-1.5 flex-1 text-[17px] font-semibold">Reins</Text>
            <IconButton
              icon={searchOpen ? X : Search}
              accessibilityLabel={searchOpen ? t('hosts.closeSearch') : t('hosts.search')}
              selected={searchOpen}
              onPress={() => {
                setSearchOpen(open => !open);
                setQuery('');
              }}
            />
            <IconButton icon={Plus} tone="accent" accessibilityLabel={t('hosts.add')} onPress={onAdd} />
          </View>

          {searchOpen ? (
            <View className="mt-1 h-[50px] flex-row items-center gap-2 rounded-[17px] bg-card pl-3.5 pr-1" style={{ borderWidth: 1.5, borderColor: `${colors.primary}80` }}>
              <Search color={colors.textTertiary} size={18} />
              <Input
                accessibilityLabel={t('hosts.search')}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                className="h-11 flex-1 border-0 bg-transparent px-0"
                placeholder={t('hosts.searchPlaceholder')}
                value={query}
                onChangeText={setQuery}
              />
            </View>
          ) : null}

          <View className="px-1 pb-[22px] pt-[22px]">
            <Text accessibilityRole="header" className="text-[34px] font-semibold leading-9" style={{ letterSpacing: -1 }}>
              {t('nav.hosts')}
            </Text>
            <Text className="mt-2 text-sm text-text3">
              {hosts.length === 0
                ? t('hosts.summaryEmpty')
                : t('hosts.summary', { total: hosts.length, connected: connectedCount })}
            </Text>
          </View>

          <View className="gap-3">
            {error ? (
              <Banner
                tone="bad"
                icon={CircleAlert}
                title={t('hosts.errorTitle')}
                body={error}
              />
            ) : null}
            {Platform.OS === 'android' && credentialRecovery.state === 'locked' ? (
              <Banner
                tone="info"
                icon={LockKeyhole}
                title={t('hosts.recoveryLocked')}
                body={t('hosts.recoveryCopy', { count: credentialRecovery.count })}
                action={(
                  <ActionButton
                    busy={credentialRecoveryBusy}
                    height={40}
                    label={credentialRecoveryBusy ? t('hosts.unlocking') : t('hosts.unlock')}
                    radius={20}
                    shadow={false}
                    onPress={() => {
                      reportBackgroundFailure(onUnlockCredentials().then(() => undefined), 'credential-unlock');
                    }}
                  />
                )}
              />
            ) : null}
            {Platform.OS === 'android' && credentialRecovery.state === 'unavailable' ? (
              <Banner tone="bad" icon={CircleAlert} body={t('hosts.recoveryUnavailable')} />
            ) : null}
          </View>

          {hosts.length === 0 ? (
            <View className="min-h-[420px] items-center justify-center px-6">
              <View className="items-center justify-center bg-card" style={{ width: 76, height: 76, borderRadius: 26 }}>
                <Server color={colors.primary} size={32} strokeWidth={1.8} />
              </View>
              <Text className="mt-5 text-[22px] font-semibold leading-7">{t('hosts.emptyTitle')}</Text>
              <Text className="mt-2 max-w-[290px] text-center text-[15px] leading-[22px] text-text2">{t('hosts.emptyCopy')}</Text>
              <ActionButton className="mt-6" height={50} icon={Plus} label={t('hosts.addFirst')} radius={25} onPress={onAdd} />
            </View>
          ) : orderedHosts.length === 0 ? (
            <View className="items-center rounded-3xl bg-card px-5 py-7">
              <Text className="text-center text-[17px] font-semibold">{t('hosts.noMatches', { query: query.trim() })}</Text>
            </View>
          ) : (
            <>
              {liveHosts.length > 0 ? (
                <>
                  <SectionLabel className="mt-1">{t('hosts.connectedSection')}</SectionLabel>
                  <View className="gap-2.5">
                    {liveHosts.map(host => {
                      const state = stateOf(host);
                      return (
                        <ConnectedHostCard
                          key={host.id}
                          active={activeHostId === host.id}
                          host={host}
                          jumpHost={host.jumpHostId ? hostsById.get(host.jumpHostId) : undefined}
                          latencyMs={latencyMsByHostId[host.id]}
                          runtime={runtimeByHostId[host.id]}
                          state={state}
                          onMore={() => openSheet(host)}
                          onLongPress={() => openSheet(host)}
                          onOpenChats={filter => onOpenChats?.(host, filter)}
                          onOpenTerminal={() => onOpenTerminal(host)}
                          onPress={() => {
                            if (state === 'error') connect(host);
                            else if (onOpenChats) onOpenChats(host);
                            else connect(host);
                          }}
                          onRetry={() => connect(host)}
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}
              {savedHosts.length > 0 ? (
                <>
                  <SectionLabel>{t('hosts.savedSection')}</SectionLabel>
                  <ListGroup>
                    {savedHosts.map(host => {
                      const displayName = hostDisplayName(host);
                      const opening = stateOf(host) === 'opening';
                      const jumpHost = host.jumpHostId ? hostsById.get(host.jumpHostId) : undefined;
                      return (
                        <View key={host.id} className="min-h-[68px] flex-row items-center bg-card pr-1">
                          <Button
                            accessibilityLabel={t('hosts.connectTo', { host: displayName })}
                            accessibilityHint={opening ? t('hosts.openingProgress') : undefined}
                            className="h-auto min-h-[68px] min-w-0 flex-1 justify-start gap-3.5 rounded-none py-3 pl-4 pr-2 active:bg-raised"
                            disabled={opening}
                            size="content"
                            variant="ghost"
                            onLongPress={() => openSheet(host)}
                            onPress={hapticPress(() => connect(host))}>
                            <View className="items-center justify-center bg-raised" style={{ width: 40, height: 40, borderRadius: 13 }}>
                              {opening
                                ? <AnimatedAgentStatusGlyph status="connecting" color={colors.working} size={18} />
                                : <Server color={colors.textTertiary} size={19} strokeWidth={1.9} />}
                            </View>
                            <View className="min-w-0 flex-1">
                              <Text className="text-base font-semibold leading-[22px]" numberOfLines={1}>{displayName}</Text>
                              <Text className="mt-0.5 font-mono text-xs leading-4 text-text3" numberOfLines={1}>
                                {sshAddress(host)}{jumpHost ? ` · ${t('hosts.via', { host: hostDisplayName(jumpHost) })}` : ''}
                              </Text>
                            </View>
                            <Text className={cn('text-[12.5px]', opening ? 'text-working' : 'text-text3')} numberOfLines={1}>
                              {opening
                                ? t('hosts.openingProgress')
                                : host.lastConnectedAt ? formatLastUsed(host.lastConnectedAt, t) : ''}
                            </Text>
                          </Button>
                          <IconButton
                            icon={Ellipsis}
                            accessibilityLabel={t('hosts.actions', { host: displayName })}
                            iconSize={19}
                            onPress={() => openSheet(host)}
                          />
                        </View>
                      );
                    })}
                  </ListGroup>
                </>
              ) : null}
              <View className="mt-4 flex-row items-start gap-2 px-1.5">
                <LockKeyhole color={colors.textTertiary} size={13} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[12.5px] leading-[18px] text-text3">
                  {Platform.OS === 'ios' ? t('hosts.footerIos') : t('hosts.footer')}
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
      <HostActionsSheet
        host={sheetHost}
        jumpHost={sheetHost?.jumpHostId ? hostsById.get(sheetHost.jumpHostId) : undefined}
        runtime={sheetHost ? runtimeByHostId[sheetHost.id] : undefined}
        state={sheetHost ? stateOf(sheetHost) : 'saved'}
        onClose={() => setSheetHostId(null)}
        onConnect={connect}
        onDelete={onDelete}
        onDisconnect={disconnect}
        onEdit={onEdit}
        onOpenChats={onOpenChats}
        onOpenTerminal={onOpenTerminal}
      />
    </View>
  );
}

function Banner({
  tone,
  icon: IconComponent,
  title,
  body,
  action,
}: {
  tone: 'bad' | 'info';
  icon: typeof Server;
  title?: string;
  body: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  const bad = tone === 'bad';
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn('flex-row items-center gap-3 rounded-[20px] p-3.5', !bad && 'bg-card')}
      style={bad ? { backgroundColor: statusTint(colors.blocked, 0.1), borderWidth: 1, borderColor: statusTint(colors.blocked, 0.3) } : undefined}>
      {bad
        ? <IconComponent color={colors.blocked} size={20} />
        : <IconTile icon={IconComponent} size={38} radius={12} color={colors.primary} background={statusTint(colors.primary, 0.14)} />}
      <View className="min-w-0 flex-1">
        {title ? <Text className={cn('text-[14.5px] font-semibold', bad && 'text-blocked')}>{title}</Text> : null}
        <Text className={cn('text-[13px] leading-[18px] text-text2', title && 'mt-0.5')}>{body}</Text>
      </View>
      {action}
    </View>
  );
}

function ConnectedHostCard({
  host,
  jumpHost,
  active,
  state,
  runtime,
  latencyMs,
  onPress,
  onLongPress,
  onMore,
  onRetry,
  onOpenChats,
  onOpenTerminal,
}: {
  host: HostProfile;
  jumpHost?: HostProfile;
  active: boolean;
  state: CardState;
  runtime?: HostRuntimeSummary;
  latencyMs?: number | null;
  onPress: () => void;
  onLongPress: () => void;
  onMore: () => void;
  onRetry: () => void;
  onOpenChats: (filter?: 'blocked') => void;
  onOpenTerminal: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const displayName = hostDisplayName(host);
  const errored = state === 'error';
  const reconnecting = state === 'reconnecting';
  const label = errored
    ? t('hosts.lostConnection')
    : reconnecting ? t('hosts.reconnecting') : active ? t('hosts.active') : t('hosts.open');
  const labelColor = errored ? colors.blocked : reconnecting ? colors.working : active ? colors.done : colors.textTertiary;
  const ring = errored ? statusTint(colors.blocked, 0.4) : active ? statusTint(colors.primary, 0.32) : 'transparent';
  return (
    <View className="bg-card" style={{ borderRadius: 24, borderWidth: 1, borderColor: ring }}>
      <View className="flex-row items-center pr-1.5">
        <Button
          accessibilityLabel={errored ? t('hosts.connectTo', { host: displayName }) : t('hosts.openChatsFor', { host: displayName })}
          accessibilityHint={label}
          className="h-auto min-w-0 flex-1 justify-start gap-3.5 rounded-none pb-1 pl-4 pt-4 active:opacity-80"
          size="content"
          variant="ghost"
          onLongPress={onLongPress}
          onPress={hapticPress(onPress)}>
          <View>
            <View
              className="items-center justify-center"
              style={{
                width: 46,
                height: 46,
                borderRadius: 15,
                backgroundColor: errored ? statusTint(colors.blocked, 0.14) : active ? statusTint(colors.primary, 0.14) : colors.raised,
              }}>
              <Server color={errored ? colors.blocked : active ? colors.primary : colors.textSecondary} size={21} strokeWidth={1.9} />
            </View>
            <View
              className="absolute items-center justify-center rounded-full bg-card"
              style={{ right: -4, bottom: -4, width: 17, height: 17 }}>
              {reconnecting
                ? <AnimatedAgentStatusGlyph status="reconnecting" color={colors.working} size={11} />
                : <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: errored ? colors.blocked : colors.done }} />}
            </View>
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row items-baseline gap-2">
              <Text className="flex-shrink text-lg font-semibold leading-6" numberOfLines={1}>{displayName}</Text>
              <Text className="text-[12.5px] font-semibold" style={{ color: labelColor }} numberOfLines={1}>{label}</Text>
            </View>
            <Text className="mt-0.5 font-mono text-[12.5px] text-text2" numberOfLines={1}>{sshAddress(host)}</Text>
          </View>
        </Button>
        <IconButton icon={Ellipsis} accessibilityLabel={t('hosts.actions', { host: displayName })} iconSize={19} onPress={onMore} />
      </View>
      {errored ? (
        <Text className="px-4 pb-4 pt-3 text-[13px] leading-[18px] text-text2">
          {t('hosts.lostConnectionCopy')}{' '}
          <Text accessibilityRole="button" className="text-[13px] font-semibold text-primary" onPress={hapticPress(onRetry)}>
            {t('hosts.retryNow')}
          </Text>
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-1.5 px-4 pb-4 pt-3.5">
          <Chip
            icon={Bot}
            label={t('hosts.agents', { count: runtime?.agentTotal ?? 0 })}
            onPress={() => onOpenChats()}
          />
          {runtime?.blockedTotal ? (
            <Chip
              dot
              tone="blocked"
              label={t('hosts.needsYou', { count: runtime.blockedTotal })}
              onPress={() => onOpenChats('blocked')}
            />
          ) : null}
          {runtime && !runtime.serverRunning && state === 'connected' ? (
            <Chip tone="warning" label={t('hosts.herdrStopped')} onPress={() => onOpenChats()} />
          ) : null}
          <Chip icon={SquareTerminal} label={t('hosts.terminalChip')} accessibilityLabel={t('hosts.openTerminal', { host: displayName })} onPress={onOpenTerminal} />
          {latencyMs != null ? (
            <Chip icon={Zap} label={`${latencyMs} ms`} accessibilityLabel={t('hosts.latency', { value: latencyMs })} />
          ) : null}
          {runtime?.protocol != null ? (
            <Chip label={`Herdr ${t('hosts.herdrProtocolValue', { version: runtime.protocol })}`} accessibilityLabel={t('hosts.herdrProtocol', { version: runtime.protocol })} />
          ) : null}
          {jumpHost ? <Chip icon={Route} label={t('hosts.via', { host: hostDisplayName(jumpHost) })} accessibilityLabel={t('hosts.jumpHost', { host: hostDisplayName(jumpHost) })} /> : null}
        </View>
      )}
    </View>
  );
}

function HostActionsSheet({
  host,
  jumpHost,
  runtime,
  state,
  onClose,
  onConnect,
  onDelete,
  onDisconnect,
  onEdit,
  onOpenChats,
  onOpenTerminal,
}: {
  host: HostProfile | null;
  jumpHost?: HostProfile;
  runtime?: HostRuntimeSummary;
  state: CardState;
  onClose: () => void;
  onConnect: (host: HostProfile) => void;
  onDelete: (host: HostProfile) => void;
  onDisconnect: (host: HostProfile) => void;
  onEdit: (host: HostProfile) => void;
  onOpenChats?: (host: HostProfile) => void;
  onOpenTerminal: (host: HostProfile) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Keep the last host while the sheet animates out.
  const lastHost = useRef<HostProfile | null>(host);
  if (host) lastHost.current = host;
  const shown = host ?? lastHost.current;
  if (!shown) return null;
  const live = state === 'connected' || state === 'reconnecting' || state === 'error';
  const run = (action: (target: HostProfile) => void) => () => {
    onClose();
    action(shown);
  };
  return (
    <BottomSheet
      visible={host !== null}
      title={hostDisplayName(shown)}
      subtitle={sshAddress(shown)}
      monoSubtitle
      lead={(
        <View className="items-center justify-center rounded-full" style={{ width: 44, height: 44, backgroundColor: live ? statusTint(colors.primary, 0.14) : colors.raised }}>
          <Server color={live ? colors.primary : colors.textSecondary} size={20} />
        </View>
      )}
      onClose={onClose}>
      <ListGroup tone="raised" radius={20}>
        {live && state !== 'error' && onOpenChats ? (
          <ListRow
            icon={MessageSquare}
            label={t('hosts.openChats')}
            description={runtime && !runtime.serverRunning ? t('hosts.herdrIsStopped') : t('hosts.agents', { count: runtime?.agentTotal ?? 0 })}
            minHeight={58}
            tileSize={34}
            tileRadius={11}
            tileBackground={colors.trackOff}
            onPress={run(target => onOpenChats(target))}
          />
        ) : (
          <ListRow
            icon={LogIn}
            label={t('common.connect')}
            description={jumpHost ? t('hosts.through', { host: hostDisplayName(jumpHost) }) : sshAddress(shown)}
            minHeight={58}
            tileSize={34}
            tileRadius={11}
            tileBackground={colors.trackOff}
            onPress={run(onConnect)}
          />
        )}
        <ListRow
          icon={SquareTerminal}
          label={t('hosts.openTerminalAction')}
          minHeight={58}
          tileSize={34}
          tileRadius={11}
          tileBackground={colors.trackOff}
          onPress={run(onOpenTerminal)}
        />
        <ListRow
          icon={Pencil}
          label={t('hosts.editHost')}
          minHeight={58}
          tileSize={34}
          tileRadius={11}
          tileBackground={colors.trackOff}
          onPress={run(onEdit)}
        />
        {live ? (
          <ListRow
            icon={LogOut}
            label={t('hosts.disconnect')}
            tone="warn"
            minHeight={58}
            tileSize={34}
            tileRadius={11}
            onPress={run(onDisconnect)}
          />
        ) : null}
        <ListRow
          icon={Trash2}
          label={t('hosts.deleteHostAction')}
          tone="danger"
          minHeight={58}
          tileSize={34}
          tileRadius={11}
          onPress={run(onDelete)}
        />
      </ListGroup>
    </BottomSheet>
  );
}

function formatLastUsed(value: string, t: TFunction): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('hosts.usedBefore');
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60_000) return t('hosts.justNow');
  if (elapsed < 3_600_000) return t('hosts.minutesAgo', { count: Math.floor(elapsed / 60_000) });
  if (elapsed < 86_400_000) return t('hosts.hoursAgo', { count: Math.floor(elapsed / 3_600_000) });
  return t('hosts.daysAgo', { count: Math.floor(elapsed / 86_400_000) });
}
