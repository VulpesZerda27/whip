import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  View,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { MessageCircle, Plus, Star, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SessionRuntimeController } from '../hooks/useSessionRuntimeManager';
import { hostDisplayName } from '../lib/hostProfiles';
import { bottomNavigationInset } from '../lib/floatingChrome';
import {
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
import type { HostProfile, AgentInfo } from '../types';
import type { CodexHost } from '../hooks/useCodexHosts';
import { codexChatKey, type CodexThread } from '../services/codexDaemon';
import { useTheme } from '../theme';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Text } from './ui/text';
import { StatusBadge } from './app-ui';
import type { ChatLibraryController } from '../hooks/useChatLibrary';
import {
  chatKey,
  emptyChatLibrary,
  type ChatFavorite,
  type ChatTarget,
} from '../services/chatLibrary';
import { codexNeedsAttention } from '../lib/codexInbox';
import { chatSyncState } from '../lib/chatSync';
import { chatNeedsAttention } from '../lib/chatInbox';
import { chatStatusPriority } from '../lib/chatInbox';
import { fetchChatCatalog, type ChatModelOption } from '../services/chatCatalog';
import { fetchChatDirectories, type ChatDirectoryOption } from '../services/chatDirectories';
import {
  checkChatReadiness,
  readinessIssues,
  type ChatReadiness,
} from '../services/chatReadiness';

interface Props {
  hosts: HostProfile[];
  sessions: SessionRuntimeController;
  onManageHosts: () => void;
  onShowChats: () => void;
  library?: ChatLibraryController;
  onOpenChat?: (target: ChatTarget) => Promise<void>;
  openError?: string | null;
  codexHosts?: CodexHost[];
  onOpenCodex?: (hostId: string, threadId: string) => void;
}

export function ChatsScreen({
  hosts,
  sessions,
  onManageHosts,
  onShowChats,
  library,
  onOpenChat,
  openError,
  codexHosts,
  onOpenCodex,
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
  const [needsYouOnly, setNeedsYouOnly] = useState(false);
  const [readiness, setReadiness] = useState<ChatReadiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkRevision, setCheckRevision] = useState(0);
  const [catalog, setCatalog] = useState<ChatModelOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [directories, setDirectories] = useState<ChatDirectoryOption[]>([]);
  const [directoriesLoading, setDirectoriesLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState(false);
  const [folderFilter, setFolderFilter] = useState('');
  const [favoriteSaved, setFavoriteSaved] = useState(false);
  const [selectedFavorite, setSelectedFavorite] = useState<string | null>(null);
  const saved = library?.value ?? emptyChatLibrary;
  const syncStates = sessions.presentationSessions
    .filter(item => !filter || item.hostId === filter)
    .map(item => ({
      id: item.id,
      name: hostDisplayName(item.host),
      ...chatSyncState(
        item,
        codexHosts?.find(h => h.sessionId === item.id)?.snapshot,
        !sessions.restoreComplete,
      ),
    }));
  const syncing = !sessions.restoreComplete || syncStates.some(item => item.loading);
  const serverLabel = (id: string) => {
    const savedHost = hosts.find(item => item.id === id);
    return savedHost ? hostDisplayName(savedHost) : 'Server removed';
  };
  const provider = preferences.provider;
  const options = preferences.providers[provider];
  const host = hosts.find(item => item.id === preferences.hostId) ?? hosts[0];
  const session = sessions.presentationSessions.find(
    item => item.hostId === host?.id,
  );
  const workspaces = session?.snapshot.workspaces ?? [];
  const workspaceDirectory = (id: string) =>
    workspaces.find(item => item.workspace_id === id)?.worktree
      ?.checkout_path ||
    session?.snapshot.panes?.find(item => item.workspace_id === id && item.cwd)
      ?.cwd ||
    '';
  const selectedWorkspaceId =
    workspaceSelection?.hostId === host?.id
      ? (workspaceSelection?.workspaceId ?? '')
      : (workspaces[0]?.workspace_id ?? '');
  const allAgents: {session: (typeof sessions.presentationSessions)[number]; agent: AgentInfo; thread?: CodexThread; attention?: boolean}[] = sessions.presentationSessions.flatMap(item =>
    item.snapshot.agents
      .filter(
        agent =>
          isChatProvider(agent.agent) && !(codexHosts && agent.agent === 'codex') && (!filter || item.hostId === filter),
      )
      .map(agent => ({ session: item, agent })),
  );
  for (const codex of codexHosts ?? []) {
    const live = sessions.presentationSessions.find(item => item.id === codex.sessionId);
    if (!live || (filter && codex.hostId !== filter)) continue;
    for (const thread of codex.snapshot.threads) {
      const activity = saved.activity[chatKey(codex.hostId, codexChatKey(thread.id))];
      const pending = codex.snapshot.requests.some(r => r.params.threadId === thread.id && r.params.isBlocking !== false);
      const attention = codexNeedsAttention(thread, pending, activity);
      const status = pending
        ? 'blocked'
        : thread.status === 'idle' || thread.status === 'done'
          ? attention ? 'done' : 'idle'
          : thread.status;
      allAgents.push({session: live, thread, attention, agent: {pane_id: codexChatKey(thread.id), terminal_id: codexChatKey(thread.id), tab_id: '', workspace_id: '', agent: 'codex', agent_status: status} as AgentInfo});
    }
  }
  const needsAttention = ({session: item, agent, attention}: (typeof allAgents)[number]) => attention ?? chatNeedsAttention(agent, saved.activity[chatKey(item.hostId, agent.pane_id)]);
  const needsYouCount = allAgents.filter(needsAttention).length;
  const agents = allAgents
    .filter(
      item => !needsYouOnly || needsAttention(item),
    )
    .sort((a, b) => {
      const aActivity =
        saved.activity[chatKey(a.session.hostId, a.agent.pane_id)];
      const bActivity =
        saved.activity[chatKey(b.session.hostId, b.agent.pane_id)];
      return (
        chatStatusPriority(a.agent.agent_status) - chatStatusPriority(b.agent.agent_status) ||
        Number(needsAttention(b)) -
          Number(needsAttention(a)) ||
        (b.thread ? b.thread.updatedAt * 1000 : bActivity?.updatedAt ?? 0) - (a.thread ? a.thread.updatedAt * 1000 : aActivity?.updatedAt ?? 0)
      );
    });
  const native =
    session?.connectionStatus === 'ready'
      ? sessions.getClient?.(session.id)?.native
      : undefined;
  const efforts = catalog.find(model => model.id === options.model)?.efforts ?? ['default' as const];
  useEffect(() => {
    let cancelled = false;
    setCatalog([]);
    setCatalogLoading(false);
    if (!creating || !native) return;
    setCatalogLoading(true);
    fetchChatCatalog(native, provider)
      .then(models => { if (!cancelled) setCatalog(models); })
      .catch(() => { if (!cancelled) setCatalog([]); })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [creating, native, provider, checkRevision]);
  useEffect(() => {
    let cancelled = false;
    setDirectories([]);
    setDirectoryError(false);
    setDirectoriesLoading(false);
    setFolderFilter('');
    if (!creating || !native) return;
    setDirectoriesLoading(true);
    fetchChatDirectories(native)
      .then(value => { if (!cancelled) setDirectories(value); })
      .catch(() => { if (!cancelled) setDirectoryError(true); })
      .finally(() => { if (!cancelled) setDirectoriesLoading(false); });
    return () => { cancelled = true; };
  }, [creating, native, checkRevision]);
  useEffect(() => {
    let cancelled = false;
    setReadiness(null);
    setReadinessError(null);
    setChecking(false);
    if (!creating || !native) return;
    setChecking(true);
    checkChatReadiness(native, provider)
      .then(result => {
        if (!cancelled) setReadiness(result);
      })
      .catch(reason => {
        if (!cancelled) setReadinessError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creating, native, provider, checkRevision]);

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
        [provider]: { ...current.providers[provider], ...(change.model !== undefined ? { effort: 'default' as const } : {}), ...change },
      },
    }));
  };

  const connect = async (selectedHost: HostProfile) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await sessions.connectSavedHost(selectedHost, { navigate: false });
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
      if (!efforts.includes(options.effort)) throw new Error('Choose an effort level supported by the selected model, or use Default.');
      const intent = chatLaunchIntent({ provider, ...options });
      if (!native)
        throw new Error('Connect to the server before starting an agent.');
      const checked = await checkChatReadiness(native, provider);
      setReadiness(checked);
      const issues = readinessIssues(checked, provider);
      if (
        checked.cli === 'missing' ||
        checked.cli === 'login-required' ||
        (provider === 'claude' && checked.integration !== 'current')
      ) {
        throw new Error(issues.join('\n'));
      }
      // Save before creating remote resources; a storage failure must not duplicate a launch.
      await saveChatLaunchPreferences({ ...preferences, hostId: host.id });
      if (provider === 'codex' && codexHosts && onOpenCodex) {
        const backend = codexHosts.find(item => item.hostId === host.id);
        if (!backend) throw new Error('Codex server is not connected.');
        let cwd = directory.trim() || workspaceDirectory(selectedWorkspaceId) || '~';
        if (cwd === '~' || cwd.startsWith('~/')) cwd = (await native.remoteHome()) + cwd.slice(1);
        const folder = await native.listDirectory(cwd);
        const thread = await backend.client.create(folder.path, name.trim(), options.model, options.effort);
        setCreating(false);
        onOpenCodex(host.id, thread.id);
        return;
      }
      const favoriteWorkspace =
        selectedFavorite && directory.trim()
          ? workspaces.find(
              item =>
                workspaceDirectory(item.workspace_id) === directory.trim(),
            )
          : undefined;
      const workspace =
        favoriteWorkspace?.workspace_id ??
        (directory.trim()
          ? (
              await sessions.createWorkspace(
                session.id,
                name.trim() || directory.trim().split('/').filter(Boolean).at(-1) || 'Chat',
                directory.trim(),
              )
            ).workspace_id
          : selectedWorkspaceId);
      // Keep an already-created workspace selected if a later launch fails.
      setWorkspaceSelection({ hostId: host.id, workspaceId: workspace });
      setDirectory('');
      await sessions.launchTab(session.id, workspace, name.trim(), intent, 'chat');
      setCreating(false);
    } catch (reason) {
      setError(String(reason));
      onShowChats();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveFavorite = () => {
    if (!host || !library?.loaded) return;
    const workspace = workspaces.find(
      item => item.workspace_id === selectedWorkspaceId,
    );
    const path = directory.trim() || workspaceDirectory(selectedWorkspaceId);
    if (!path && !selectedWorkspaceId) {
      setError('Choose a workspace or enter a project directory first.');
      return;
    }
    const label =
      name.trim() ||
      workspace?.label ||
      path.split('/').filter(Boolean).at(-1) ||
      'Project';
    const favorite: ChatFavorite = {
      id: chatKey(host.id, `${provider}:${path || selectedWorkspaceId}`),
      hostId: host.id,
      label,
      directory: path,
      workspaceId: directory.trim() ? '' : selectedWorkspaceId,
      provider,
      ...options,
    };
    library.update(previous => ({
      ...previous,
      favorites: [
        favorite,
        ...previous.favorites.filter(item => item.id !== favorite.id),
      ].slice(0, 30),
    }));
    setFavoriteSaved(true);
  };
  const openFavorite = (favorite: ChatFavorite) => {
    if (!hosts.some(item => item.id === favorite.hostId)) {
      setError('This favorite’s server was removed. Add it again in Hosts.');
      return;
    }
    setPreferences(current => ({
      ...current,
      provider: favorite.provider,
      hostId: favorite.hostId,
      providers: {
        ...current.providers,
        [favorite.provider]: { model: favorite.model, effort: favorite.effort },
      },
    }));
    const live = sessions.presentationSessions.find(
      item => item.hostId === favorite.hostId,
    );
    const workspace = live?.snapshot.workspaces.find(
      item =>
        item.workspace_id === favorite.workspaceId ||
        (favorite.directory &&
          (item.worktree?.checkout_path === favorite.directory ||
            live.snapshot.panes?.some(
              pane =>
                pane.workspace_id === item.workspace_id &&
                pane.cwd === favorite.directory,
            ))),
    );
    setWorkspaceSelection(
      workspace
        ? { hostId: favorite.hostId, workspaceId: workspace.workspace_id }
        : null,
    );
    setDirectory(workspace ? '' : favorite.directory);
    setName(favorite.label);
    setFavoriteSaved(false);
    setSelectedFavorite(favorite.id);
    setError(null);
    setCreating(true);
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
            setFavoriteSaved(false);
            setSelectedFavorite(null);
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
            label={`Needs you (${needsYouCount})`}
            selected={needsYouOnly}
            onPress={() => setNeedsYouOnly(value => !value)}
          />
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
        {library?.error || openError ? (
          <Text
            accessibilityRole="alert"
            className="mb-3 text-sm text-destructive"
          >
            {library?.error || openError}
          </Text>
        ) : null}
        {saved.favorites.length > 0 ? (
          <View className="mb-5 gap-2">
            <Text className="text-sm font-semibold">Favorite projects</Text>
            {saved.favorites.map(favorite => (
              <View key={favorite.id} className="flex-row items-center gap-2">
                <Button
                  disabled={busy}
                  variant="outline"
                  className="h-auto min-w-0 flex-1 flex-col items-start rounded-2xl p-4"
                  accessibilityLabel={`Start favorite ${favorite.label}`}
                  onPress={() => openFavorite(favorite)}
                >
                  <Text className="font-semibold" numberOfLines={1}>
                    {favorite.label}
                  </Text>
                  <Text
                    className="text-xs text-muted-foreground"
                    numberOfLines={1}
                  >
                    {serverLabel(favorite.hostId)} · {favorite.provider} ·{' '}
                    {favorite.model || 'Default model'} · {favorite.effort}
                  </Text>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel={`Remove favorite ${favorite.label}`}
                  onPress={() =>
                    library?.update(previous => ({
                      ...previous,
                      favorites: previous.favorites.filter(
                        item => item.id !== favorite.id,
                      ),
                    }))
                  }
                >
                  <X size={18} color={colors.textSecondary} />
                </Button>
              </View>
            ))}
          </View>
        ) : null}
        {error && !creating ? (
          <Text
            accessibilityRole="alert"
            className="mb-3 text-sm text-destructive"
          >
            {error}
          </Text>
        ) : null}
        {syncing ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Syncing chats" className="mb-3 flex-row items-center gap-2 py-2">
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text className="text-sm text-muted-foreground">Syncing chats…</Text>
          </View>
        ) : null}
        {syncStates.filter(item => item.error).map(item => (
          <View key={item.id} className="mb-3 gap-2">
            <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
              {item.name}: {item.error}
            </Text>
            <Button variant="secondary" className="self-start rounded-full" onPress={onManageHosts}>
              <Text>Manage servers</Text>
            </Button>
          </View>
        ))}
        {agents.map(({ session: agentSession, agent, thread, attention }) => {
          const snapshot = sessionSnapshot(agentSession);
          const tab = snapshot.tabs.find(item => item.tab_id === agent.tab_id);
          const workspace = snapshot.workspaces.find(
            item => item.workspace_id === agent.workspace_id,
          );
          return (
            <Button
              key={`${agentSession.id}:${agent.pane_id}`}
              variant="outline"
              className="mb-3 h-auto flex-col items-start rounded-2xl p-4"
              accessibilityLabel={`Open chat ${thread?.name || tab?.label || agent.agent} on ${hostDisplayName(agentSession.host)}`}
              onPress={() => {
                if (thread && onOpenCodex) onOpenCodex(agentSession.hostId, thread.id);
                else if (onOpenChat)
                  void onOpenChat({
                    hostId: agentSession.hostId,
                    paneId: agent.pane_id,
                  });
                else sessions.openAgentTerminal(agentSession.id, agent);
              }}
            >
              <View className="w-full flex-row items-center justify-between gap-2">
                <Text
                  className="flex-1 text-base font-semibold"
                  numberOfLines={1}
                >
                  {thread?.name || tab?.label || (agent.agent === 'codex' ? 'Codex' : 'Claude')}
                </Text>
                <StatusBadge status={agent.agent_status} />
                {agent.agent_status === 'done' &&
                (attention ?? chatNeedsAttention(
                  agent,
                  saved.activity[chatKey(agentSession.hostId, agent.pane_id)],
                )) ? (
                  <Text className="text-xs font-semibold text-primary">
                    New
                  </Text>
                ) : null}
              </View>
              <Text
                className="mt-2 text-xs text-muted-foreground"
                numberOfLines={1}
              >
                {hostDisplayName(agentSession.host)} ·{' '}
                {thread?.cwd.split('/').filter(Boolean).at(-1) || workspace?.label || 'Workspace'} ·{' '}
                {agent.agent === 'codex' ? 'Codex' : 'Claude'}
                {chatSyncState(agentSession, undefined, !sessions.restoreComplete).loading ? ' · Syncing…' : agentSession.connectionStatus === 'ready' ? '' : ' · Offline'}
              </Text>
            </Button>
          );
        })}
        {agents.length === 0 ? (
          <View className="items-center px-6 py-14">
            <MessageCircle size={40} color={colors.textSecondary} />
            <Text className="mt-5 text-lg font-semibold">
              {syncing ? 'Loading your chats' : needsYouOnly ? 'All caught up' : 'A little room to think'}
            </Text>
            <Text className="mt-2 text-center text-sm leading-6 text-muted-foreground">
              {syncing ? 'Your servers reconnect automatically. Chats appear here as they arrive.' : needsYouOnly
                ? 'No agents need your attention in this view.'
                : 'Connect a server, then start a Codex or Claude conversation. Your existing agents appear here too.'}
            </Text>
            {!syncing ? <Button
              variant="secondary"
              className="mt-5 rounded-full"
              onPress={onManageHosts}
            >
              <Text>Manage servers</Text>
            </Button> : null}
          </View>
        ) : null}
      </ScrollView>
      <Modal
        visible={creating}
        animationType="slide"
        onRequestClose={() => {
          if (busy) return;
          if (Keyboard.isVisible()) Keyboard.dismiss();
          else setCreating(false);
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
            {native ? (
              <Field label="Server readiness">
                {checking ? (
                  <Text className="text-sm text-muted-foreground">
                    Checking CLI, login and chat integration…
                  </Text>
                ) : null}
                {readiness ? (
                  <>
                    {readiness.version ? (
                      <Text className="text-sm">{readiness.version}</Text>
                    ) : null}
                    {readinessIssues(readiness, provider).length === 0 ? (
                      <Text className="text-sm text-muted-foreground">
                        Credentials present · chat integration ready
                      </Text>
                    ) : (
                      readinessIssues(readiness, provider).map(issue => (
                        <Text
                          key={issue}
                          className="mt-1 text-sm text-destructive"
                        >
                          {issue}
                        </Text>
                      ))
                    )}
                  </>
                ) : null}
                {readinessError ? (
                  <Text className="text-sm text-destructive">
                    {readinessError}
                  </Text>
                ) : null}
                <View className="mt-2 flex-row flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={checking || busy}
                    onPress={() => setCheckRevision(value => value + 1)}
                  >
                    <Text>Check again</Text>
                  </Button>
                  {readiness && readiness.integration !== 'current' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || checking}
                      accessibilityLabel="Repair chat integration"
                      onPress={async () => {
                        if (busyRef.current) return;
                        busyRef.current = true;
                        setBusy(true);
                        setError(null);
                        try {
                          await native.installAgentIntegration(provider);
                          setCheckRevision(value => value + 1);
                        } catch (reason) {
                          setError(String(reason));
                        } finally {
                          busyRef.current = false;
                          setBusy(false);
                        }
                      }}
                    >
                      <Text>Repair integration</Text>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onPress={() => {
                      if (session) {
                        setCreating(false);
                        sessions.openSshShell(session.id);
                      }
                    }}
                  >
                    <Text>Server terminal</Text>
                  </Button>
                </View>
              </Field>
            ) : null}
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
                {[{ id: '', label: 'Server default' }, ...catalog.filter(model => model.id)].map(model => (
                  <Choice
                    key={model.id}
                    disabled={busy}
                    label={model.label}
                    selected={options.model === model.id}
                    onPress={() => updateOptions({ model: model.id })}
                  />
                ))}
              </View>
              <Text className="mt-2 text-xs text-muted-foreground">
                {catalogLoading ? 'Loading models from this server…' : catalog.length
                  ? 'Models reported by this server. You can also enter a model ID.'
                  : 'Model list unavailable. Use the server default or enter a model ID.'}
              </Text>
            </Field>
            <Field label="Effort">
              <View className="flex-row flex-wrap gap-2">
                {efforts.map(effort => (
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
                {!efforts.includes(options.effort) ? 'The saved effort is unavailable for this model. Choose Default or a supported level.' : 'Effort levels reported for the selected model.'}
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
              <Text className="mt-3 text-sm font-medium">New workspace folder</Text>
              {directoriesLoading ? <Text className="mt-2 text-xs text-muted-foreground">Loading folders…</Text> : null}
              {directories.length > 10 ? (
                <Input accessibilityLabel="Find project folder" className="mt-2" value={folderFilter} onChangeText={setFolderFilter} placeholder="Find a project…" autoCorrect={false} />
              ) : null}
              <View className="mt-2 flex-row flex-wrap gap-2">
                {directories.filter(folder => folder.label.startsWith('~') || folder.label.toLowerCase().includes(folderFilter.toLowerCase())).map(folder => (
                  <Choice key={folder.path} label={folder.label} disabled={busy} selected={directory === folder.path} onPress={() => setDirectory(folder.path)} />
                ))}
              </View>
              {directoryError ? <Text className="mt-2 text-xs text-muted-foreground">Could not load folders. Check the server again or enter a path below.</Text> : null}
              <Input
                accessibilityLabel="New project directory"
                className="mt-2"
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                value={directory}
                placeholder="Or enter another absolute directory"
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
            {library ? (
              <Button
                accessibilityLabel="Save favorite project"
                variant="outline"
                disabled={!host || busy || !library.loaded}
                onPress={saveFavorite}
              >
                <Star size={18} color={colors.text} />
                <Text>
                  {favoriteSaved
                    ? 'Favorite saved'
                    : 'Save as favorite project'}
                </Text>
              </Button>
            ) : null}
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
