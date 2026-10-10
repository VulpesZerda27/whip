import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MessageCircle, Plus, Server, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SessionRuntimeController } from '../hooks/useSessionRuntimeManager';
import { hostDisplayName } from '../lib/hostProfiles';
import { bottomNavigationInset } from '../lib/floatingChrome';
import {
  chatEfforts,
  chatModels,
  chatLaunchIntent,
  isChatProvider,
  type ChatEffort,
} from '../lib/chatLaunch';
import { sessionSnapshot } from '../liveHostSessions';
import {
  defaultChatLaunchPreferences,
  loadChatLaunchPreferences,
  saveChatLaunchPreferences,
} from '../services/chatLaunchPreferences';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import type { HostProfile } from '../types';
import { useTheme } from '../theme';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Text } from './ui/text';
import { StatusBadge } from './app-ui';

interface Props {
  hosts: HostProfile[];
  sessions: SessionRuntimeController;
  onManageHosts: () => void;
  onShowChats: () => void;
}

export function ChatsScreen({
  hosts,
  sessions,
  onManageHosts,
  onShowChats,
}: Props) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [preferences, setPreferences] = useState(defaultChatLaunchPreferences);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [workspaceSelection, setWorkspaceSelection] = useState<{
    hostId: string;
    workspaceId: string;
  } | null>(null);
  const [directory, setDirectory] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const provider = preferences.provider;
  const options = preferences.providers[provider];
  const host = hosts.find(item => item.id === preferences.hostId) ?? hosts[0];
  const session = sessions.presentationSessions.find(
    item => item.hostId === host?.id,
  );
  const workspaces = session?.snapshot.workspaces ?? [];
  const selectedWorkspaceId =
    workspaceSelection?.hostId === host?.id
      ? (workspaceSelection?.workspaceId ?? '')
      : (workspaces[0]?.workspace_id ?? '');
  const agents = sessions.presentationSessions.flatMap(item =>
    item.snapshot.agents
      .filter(
        agent =>
          isChatProvider(agent.agent) && (!filter || item.hostId === filter),
      )
      .map(agent => ({ session: item, agent })),
  );

  useEffect(() => {
    let cancelled = false;
    loadChatLaunchPreferences()
      .then(value => {
        if (!cancelled) setPreferences(value);
      })
      .catch(reason => {
        if (!cancelled)
          setError(`Could not load chat defaults: ${String(reason)}`);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateOptions = (change: { model?: string; effort?: ChatEffort }) => {
    setPreferences(current => ({
      ...current,
      providers: {
        ...current.providers,
        [provider]: { ...current.providers[provider], ...change },
      },
    }));
  };

  const connect = async (selectedHost: HostProfile) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await sessions.connectSavedHost(selectedHost);
      const connected = sessions
        .getState()
        .sessions.find(item => item.hostId === selectedHost.id);
      if (connected?.connectionStatus === 'connected') {
        await sessions.startServer(connected.id);
      }
      const readySession = sessions
        .getState()
        .sessions.find(item => item.hostId === selectedHost.id);
      if (readySession?.connectionStatus !== 'ready') {
        throw new Error(
          readySession?.connectionError ||
            'Connection is not ready. Check this server in Hosts.',
        );
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
      onShowChats();
    }
  };

  const launch = async () => {
    if (busyRef.current) return;
    setError(null);
    if (!host) {
      setError('Add a server in Hosts first.');
      return;
    }
    if (session?.connectionStatus !== 'ready') {
      setError('Connect to the selected server first.');
      return;
    }
    if (!selectedWorkspaceId && !directory.trim()) {
      setError('Enter a project directory to create a workspace.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const intent = chatLaunchIntent({ provider, ...options });
      // Save before creating remote resources; a storage failure must not duplicate a launch.
      await saveChatLaunchPreferences({ ...preferences, hostId: host.id });
      const workspace = directory.trim()
        ? (
            await sessions.createWorkspace(
              session.id,
              name.trim() || 'Chat',
              directory.trim(),
            )
          ).workspace_id
        : selectedWorkspaceId;
      // Keep an already-created workspace selected if a later launch fails.
      setWorkspaceSelection({ hostId: host.id, workspaceId: workspace });
      setDirectory('');
      await sessions.launchTab(session.id, workspace, name.trim(), intent);
      setCreating(false);
    } catch (reason) {
      setError(String(reason));
      onShowChats();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-5 pb-4 pt-5">
        <View>
          <Text className="text-3xl font-bold">Chats</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Your agents, wherever you are.
          </Text>
        </View>
        <Button
          accessibilityLabel="New agent"
          disabled={!loaded || busy}
          className="size-12 rounded-full"
          onPress={() => {
            setError(null);
            setCreating(true);
          }}
        >
          <Plus color={colors.onPrimary} size={22} />
        </Button>
      </View>
      <View className="px-5 pb-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Choice
            label="All servers"
            selected={filter === null}
            onPress={() => setFilter(null)}
          />
          {hosts.map(item => (
            <Choice
              key={item.id}
              label={hostDisplayName(item)}
              selected={filter === item.id}
              onPress={() => setFilter(item.id)}
            />
          ))}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomNavigationInset(bottom) }}
        className="flex-1 px-5"
      >
        {error && !creating ? (
          <Text
            accessibilityRole="alert"
            className="mb-3 text-sm text-destructive"
          >
            {error}
          </Text>
        ) : null}
        {hosts
          .filter(item => !filter || item.id === filter)
          .map(item => {
            const live = sessions.presentationSessions.find(
              value => value.hostId === item.id,
            );
            if (live?.connectionStatus === 'ready') return null;
            return (
              <Button
                key={item.id}
                disabled={busy || sessions.connectingHostIds.has(item.id)}
                variant="outline"
                className="mb-3 h-auto flex-row justify-between rounded-2xl p-4"
                onPress={() => connect(item)}
              >
                <Server size={18} color={colors.textSecondary} />
                <Text className="flex-1 px-3">{hostDisplayName(item)}</Text>
                <Text className="text-sm text-muted-foreground">
                  {busy || sessions.connectingHostIds.has(item.id)
                    ? 'Connecting…'
                    : 'Connect'}
                </Text>
              </Button>
            );
          })}
        {agents.map(({ session: agentSession, agent }) => {
          const snapshot = sessionSnapshot(agentSession);
          const tab = snapshot.tabs.find(item => item.tab_id === agent.tab_id);
          const workspace = snapshot.workspaces.find(
            item => item.workspace_id === agent.workspace_id,
          );
          return (
            <Button
              key={`${agentSession.id}:${agent.pane_id}`}
              variant="outline"
              className="mb-3 h-auto items-start rounded-2xl p-4"
              accessibilityLabel={`Open chat ${tab?.label || agent.agent} on ${hostDisplayName(agentSession.host)}`}
              onPress={() => sessions.openAgentTerminal(agentSession.id, agent)}
            >
              <View className="w-full flex-row items-center justify-between gap-2">
                <Text
                  className="flex-1 text-base font-semibold"
                  numberOfLines={1}
                >
                  {tab?.label || (agent.agent === 'codex' ? 'Codex' : 'Claude')}
                </Text>
                <StatusBadge status={agent.agent_status} />
              </View>
              <Text
                className="mt-2 text-xs text-muted-foreground"
                numberOfLines={1}
              >
                {hostDisplayName(agentSession.host)} ·{' '}
                {workspace?.label || 'Workspace'} ·{' '}
                {agent.agent === 'codex' ? 'Codex' : 'Claude'}
                {agentSession.connectionStatus === 'ready' ? '' : ' · Offline'}
              </Text>
            </Button>
          );
        })}
        {agents.length === 0 ? (
          <View className="items-center px-6 py-14">
            <MessageCircle size={40} color={colors.textSecondary} />
            <Text className="mt-5 text-lg font-semibold">
              A little room to think
            </Text>
            <Text className="mt-2 text-center text-sm leading-6 text-muted-foreground">
              Connect a server, then start a Codex or Claude conversation. Your
              existing agents appear here too.
            </Text>
            <Button
              variant="secondary"
              className="mt-5 rounded-full"
              onPress={onManageHosts}
            >
              <Text>Manage servers</Text>
            </Button>
          </View>
        ) : null}
      </ScrollView>
      <Modal
        visible={creating}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setCreating(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-background"
          style={{ paddingTop: 24, paddingBottom: bottom }}
        >
          <View className="flex-row items-center justify-between px-5 py-4">
            <Text className="text-2xl font-bold">New agent</Text>
            <Button
              accessibilityLabel="Close new agent"
              disabled={busy}
              variant="ghost"
              size="icon"
              onPress={() => setCreating(false)}
            >
              <X color={colors.text} />
            </Button>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            className="flex-1 px-5"
            contentContainerClassName="gap-5 pb-6"
          >
            <Field label="Server">
              <View className="flex-row flex-wrap gap-2">
                {hosts.map(item => (
                  <Choice
                    key={item.id}
                    disabled={busy}
                    label={hostDisplayName(item)}
                    selected={host?.id === item.id}
                    onPress={() => {
                      setPreferences(current => ({
                        ...current,
                        hostId: item.id,
                      }));
                      setWorkspaceSelection(null);
                      setDirectory('');
                    }}
                  />
                ))}
              </View>
              {host && session?.connectionStatus !== 'ready' ? (
                <Button
                  disabled={busy}
                  variant="secondary"
                  className="mt-3"
                  onPress={() => connect(host)}
                >
                  <Text>Connect to server</Text>
                </Button>
              ) : null}
              {!host ? (
                <Button
                  onPress={() => {
                    setCreating(false);
                    onManageHosts();
                  }}
                >
                  <Text>Add a server</Text>
                </Button>
              ) : null}
            </Field>
            <Field label="Provider">
              <View className="flex-row gap-2">
                {(['codex', 'claude'] as const).map(item => (
                  <Choice
                    key={item}
                    disabled={busy}
                    label={item === 'codex' ? 'Codex' : 'Claude'}
                    selected={provider === item}
                    onPress={() =>
                      setPreferences(current => ({
                        ...current,
                        provider: item,
                      }))
                    }
                  />
                ))}
              </View>
              <Text className="mt-2 text-xs text-muted-foreground">
                {provider === 'codex'
                  ? 'Auto-review · workspace access'
                  : 'Auto mode'}
              </Text>
            </Field>
            <Field label="Model">
              <Input
                accessibilityLabel="Model"
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                value={options.model}
                placeholder="Server default"
                onChangeText={model => updateOptions({ model })}
              />
              <View className="mt-2 flex-row flex-wrap gap-2">
                {['', ...chatModels[provider]].map(model => (
                  <Choice
                    key={model}
                    disabled={busy}
                    label={model || 'Server default'}
                    selected={options.model === model}
                    onPress={() => updateOptions({ model })}
                  />
                ))}
              </View>
              <Text className="mt-2 text-xs text-muted-foreground">
                Leave blank for the server default, or enter any model your
                account supports.
              </Text>
            </Field>
            <Field label="Effort">
              <View className="flex-row flex-wrap gap-2">
                {chatEfforts[provider].map(effort => (
                  <Choice
                    key={effort}
                    disabled={busy}
                    label={effort === 'default' ? 'Default' : effort}
                    selected={options.effort === effort}
                    onPress={() => updateOptions({ effort })}
                  />
                ))}
              </View>
              <Text className="mt-2 text-xs text-muted-foreground">
                Available effort levels depend on the selected model.
              </Text>
            </Field>
            <Field label="Workspace">
              <View className="flex-row flex-wrap gap-2">
                {workspaces.map(item => (
                  <Choice
                    key={item.workspace_id}
                    disabled={busy}
                    label={item.label || 'Workspace'}
                    selected={
                      !directory.trim() &&
                      selectedWorkspaceId === item.workspace_id
                    }
                    onPress={() => {
                      if (host) {
                        setWorkspaceSelection({
                          hostId: host.id,
                          workspaceId: item.workspace_id,
                        });
                      }
                      setDirectory('');
                    }}
                  />
                ))}
              </View>
              <Input
                accessibilityLabel="New project directory"
                className="mt-2"
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                value={directory}
                placeholder="Or a new project directory, e.g. /home/me/project"
                onChangeText={setDirectory}
              />
            </Field>
            <Field label="Conversation name (optional)">
              <Input
                accessibilityLabel="Conversation name"
                editable={!busy}
                value={name}
                onChangeText={setName}
                placeholder="What are you working on?"
              />
            </Field>
            {error ? (
              <Text
                accessibilityRole="alert"
                className="text-sm text-destructive"
              >
                {error}
              </Text>
            ) : null}
          </ScrollView>
          <View className="px-5 py-4">
            <Button
              accessibilityLabel="Start conversation"
              disabled={busy || !host || session?.connectionStatus !== 'ready'}
              className="h-14 rounded-full"
              onPress={() => reportBackgroundFailure(launch(), 'chat-launch')}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text>Start conversation</Text>
              )}
            </Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="mb-2 text-sm font-semibold">{label}</Text>
      {children}
    </View>
  );
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      disabled={disabled}
      variant={selected ? 'default' : 'outline'}
      className="h-10 rounded-full px-4"
      onPress={onPress}
    >
      <Text>{label}</Text>
    </Button>
  );
}
