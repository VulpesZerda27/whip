import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  View,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { Bot, Check, ChevronRight, CircleAlert, FolderOpen, Plus, RefreshCw, Search, Star, SquareTerminal, Wrench, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SessionRuntimeController } from '../hooks/useSessionRuntimeManager';
import { hostDisplayName } from '../lib/hostProfiles';
import { bottomNavigationInset } from '../lib/floatingChrome';
import {
  chatLaunchIntent,
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
import type { CodexHost } from '../hooks/useCodexHosts';
import { cn } from '../lib/utils';
import { nightfallShadows, statusColor, statusTint, useTheme } from '../theme';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Text } from './ui/text';
import { AgentStatusMedallion } from './app-ui';
import { ActionButton, BusySpinner, ListGroup, SectionLabel, SegmentedControl } from './nightfall';
import type { ChatLibraryController } from '../hooks/useChatLibrary';
import {
  chatKey,
  emptyChatLibrary,
  type ChatFavorite,
  type ChatTarget,
} from '../services/chatLibrary';
import { chatSyncState } from '../lib/chatSync';
import { shortHomePath } from '../lib/paths';
import {
  buildChatRows,
  chatRowNeedsAttention,
  chatRowStatus,
  chatRowTitle,
  chatRowUpdatedAt,
  chatStatusCounts,
  formatRelativeShort,
  hostChatDotStatus,
  matchesChatSearch,
  matchesChatStatusFilter,
  sortChatRows,
  type ChatRow,
  type ChatStatusFilter,
} from '../lib/chatList';
import { fetchChatCatalog, type ChatModelOption } from '../services/chatCatalog';
import { fetchChatDirectories, type ChatDirectoryOption } from '../services/chatDirectories';
import {
  checkChatReadiness,
  readinessIssues,
  type ChatReadiness,
} from '../services/chatReadiness';

/** Opens Chats scoped to one server (and optionally a status), e.g. from Servers. */
export interface ChatsScopeRequest {
  hostId: string;
  status: ChatStatusFilter;
  nonce: number;
}

interface Props {
  scopeRequest?: ChatsScopeRequest | null;
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
  scopeRequest,
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
  const [statusFilter, setStatusFilter] = useState<ChatStatusFilter>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
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
  const appliedScope = useRef(0);
  useEffect(() => {
    if (!scopeRequest || scopeRequest.nonce === appliedScope.current) return;
    appliedScope.current = scopeRequest.nonce;
    setFilter(scopeRequest.hostId);
    setStatusFilter(scopeRequest.status);
    setSearchOpen(false);
    setQuery('');
  }, [scopeRequest]);
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
  const allServerRows = buildChatRows(sessions.presentationSessions, codexHosts, saved.activity);
  const scopedRows = filter ? allServerRows.filter(row => row.session.hostId === filter) : allServerRows;
  const counts = chatStatusCounts(scopedRows, saved.activity);
  const rowTitle = chatRowTitle;
  const agents = sortChatRows(
    scopedRows.filter(row =>
      matchesChatStatusFilter(chatRowStatus(row, saved.activity), statusFilter) &&
      matchesChatSearch(row, rowTitle(row), searchOpen ? query : ''),
    ),
    saved.activity,
  );
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
      if (provider === 'codex' && codexHosts && onOpenCodex) {
        const backend = codexHosts.find(item => item.hostId === host.id);
        if (!backend) throw new Error('Codex server is not connected.');
        let cwd = directory.trim() || workspaceDirectory(workspace) || '~';
        if (cwd === '~' || cwd.startsWith('~/')) cwd = (await native.remoteHome()) + cwd.slice(1);
        const folder = await native.listDirectory(cwd);
        const thread = await backend.client.create(folder.path, name.trim(), options.model, options.effort);
        try {
          await sessions.launchTab(session.id, workspace, name.trim() || 'Codex', {
            type: 'agent', kind: 'codex', args: ['resume', thread.id], reverseControl: false,
          }, 'background');
        } catch (reason) {
          // Keep the already-created conversation accessible and never replay
          // an ambiguous terminal launch automatically.
          Alert.alert('Conversation created', `Herdr could not finish opening its terminal: ${String(reason)}\n\nUse Open terminal in this chat to finish setup. It appears in the chat list once open in Herdr.`);
        }
        setCreating(false);
        onOpenCodex(host.id, thread.id);
        return;
      }
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

  const scopedSession = filter ? sessions.presentationSessions.find(item => item.hostId === filter) : undefined;
  const scopedHost = filter ? hosts.find(item => item.id === filter) : undefined;
  const connectedCount = sessions.presentationSessions.filter(item => item.connectionStatus === 'ready').length;
  const caption = scopedHost
    ? `${hostDisplayName(scopedHost)} · ${scopedSession?.connectionStatus === 'ready'
      ? scopedSession.snapshot.server.protocol != null ? `Herdr P${scopedSession.snapshot.server.protocol}` : 'Connected'
      : scopedSession?.connectionStatus === 'error' ? 'Connection lost'
        : scopedSession && scopedSession.connectionStatus !== 'disconnected' ? 'Connecting…' : 'Offline'}`
    : `All servers · ${connectedCount} connected`;
  const mergedQueue = !filter && new Set(scopedRows.map(row => row.session.hostId)).size > 1;
  const startNewAgent = () => {
    setError(null);
    setFavoriteSaved(false);
    setSelectedFavorite(null);
    if (filter) setPreferences(current => ({ ...current, hostId: filter }));
    setCreating(true);
  };
  const searching = searchOpen && query.trim().length > 0;
  const statusFilterLabel = { blocked: 'need you', working: 'working', done: 'done' } as const;

  return (
    <View className="flex-1">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomNavigationInset(bottom) }}
        className="flex-1"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 pb-0.5 pt-3"
        >
          <RailChip
            label="All servers"
            count={allServerRows.length}
            selected={filter === null}
            onPress={() => {
              setFilter(null);
              setStatusFilter(null);
            }}
          />
          {hosts.map(item => {
            const live = sessions.presentationSessions.find(entry => entry.hostId === item.id);
            const hostRows = allServerRows.filter(row => row.session.hostId === item.id);
            const dot = hostChatDotStatus(live, hostRows, saved.activity);
            return (
              <RailChip
                key={item.id}
                label={hostDisplayName(item)}
                count={hostRows.length}
                dotColor={dot ? (dot === 'warning' ? colors.warning : statusColor(dot, colors)) : undefined}
                selected={filter === item.id}
                onPress={() => {
                  setFilter(item.id);
                  setStatusFilter(null);
                }}
              />
            );
          })}
        </ScrollView>
        <View className="flex-row items-end gap-2 pl-5 pr-4 pt-[22px]">
          <View className="min-w-0 flex-1">
            <Text className="text-[13px] font-medium leading-[18px] text-text3" numberOfLines={1}>
              {caption}
            </Text>
            <Text
              accessibilityRole="header"
              className="text-[32px] font-semibold leading-[34px]"
              style={{ letterSpacing: -0.96 }}
            >
              Chats
            </Text>
          </View>
          <Button
            accessibilityLabel={searchOpen ? 'Close search' : 'Search chats'}
            accessibilityState={{ expanded: searchOpen }}
            className={cn('size-11 rounded-full', searchOpen ? 'bg-raised' : 'bg-card')}
            size="content"
            variant="ghost"
            onPress={() => {
              setSearchOpen(open => !open);
              setQuery('');
            }}
          >
            <Search color={colors.text} size={19} strokeWidth={2} />
          </Button>
          <Button
            accessibilityLabel="New agent"
            disabled={!loaded || busy}
            className="size-11 rounded-full"
            size="content"
            style={{ boxShadow: nightfallShadows.accentButton }}
            onPress={startNewAgent}
          >
            <Plus color={colors.onPrimary} size={20} strokeWidth={2.3} />
          </Button>
        </View>
        {searchOpen ? (
          <View className="mx-4 mt-3 h-[50px] flex-row items-center gap-2 rounded-[17px] bg-card pl-3.5 pr-1" style={{ borderWidth: 1.5, borderColor: `${colors.primary}80` }}>
            <Search color={colors.textTertiary} size={18} />
            <Input
              accessibilityLabel="Search chats"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              className="h-11 flex-1 border-0 bg-transparent px-0"
              placeholder="Chat, agent or folder"
              value={query}
              onChangeText={setQuery}
            />
          </View>
        ) : null}
        <View className="px-4">
          {library?.error || openError ? (
            <Banner tone="bad" message={library?.error || openError || ''} />
          ) : null}
          {error && !creating ? <Banner tone="bad" message={error} /> : null}
          <View className="mt-4 flex-row gap-2">
            {([
              { key: null, label: 'All', count: counts.all },
              { key: 'blocked', label: 'Need you', count: counts.blocked },
              { key: 'working', label: 'Working', count: counts.working },
              { key: 'done', label: 'Done', count: counts.done },
            ] as const).map(tile => (
              <StatusTile
                key={tile.label}
                count={tile.count}
                label={tile.label}
                color={tile.key ? statusColor(tile.key, colors) : colors.text}
                selected={statusFilter === tile.key}
                onPress={() => setStatusFilter(current => (tile.key === null || current === tile.key ? null : tile.key))}
              />
            ))}
          </View>
          {saved.favorites.length > 0 ? (
            <>
              <SectionLabel>Favorite projects</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="-mx-4"
                contentContainerClassName="gap-2.5 px-4"
              >
                {saved.favorites.map(favorite => (
                  <View key={favorite.id} className="w-[220px]">
                    <Button
                      disabled={busy}
                      variant="ghost"
                      size="content"
                      className="h-auto min-h-[76px] flex-col items-start justify-center gap-1 rounded-[20px] bg-card py-3 pl-3.5 pr-10 active:bg-raised"
                      accessibilityLabel={`Start favorite ${favorite.label}`}
                      onPress={() => openFavorite(favorite)}
                    >
                      <View className="flex-row items-center gap-2">
                        <Star color={colors.warning} size={15} strokeWidth={2} />
                        <Text className="flex-shrink text-[15px] font-semibold" numberOfLines={1}>
                          {favorite.label}
                        </Text>
                      </View>
                      <Text className="text-xs leading-4 text-text3" numberOfLines={2}>
                        {serverLabel(favorite.hostId)} · {favorite.provider} · {favorite.model || 'Default model'} · {favorite.effort}
                      </Text>
                    </Button>
                    <Button
                      variant="ghost"
                      size="content"
                      className="absolute right-1 top-1 size-9 rounded-full active:bg-overlay"
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
                      <X size={16} color={colors.textTertiary} />
                    </Button>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
          <View className="flex-row items-center gap-2 px-1 pb-2 pt-[22px]">
            <Text accessibilityRole="header" className="flex-1 text-[13px] font-semibold text-text2">
              Attention queue
            </Text>
            {statusFilter ? (
              <>
                <Text className="text-[12.5px] text-text3">Showing {statusFilterLabel[statusFilter]}</Text>
                <Button
                  accessibilityLabel="Clear filter"
                  className="h-[30px] min-h-0 rounded-full bg-raised px-3"
                  size="content"
                  variant="ghost"
                  hitSlop={7}
                  onPress={() => setStatusFilter(null)}
                >
                  <Text className="text-[12.5px] font-semibold">Clear</Text>
                </Button>
              </>
            ) : (
              <Text className="text-[12.5px] text-text3">Needs you first</Text>
            )}
          </View>
          {syncing ? (
            <View accessibilityRole="progressbar" accessibilityLabel="Syncing chats" className="mb-2 flex-row items-center gap-2.5 px-1 py-1.5">
              <BusySpinner color={colors.working} size={14} />
              <Text className="text-[13px] text-text3">Syncing chats…</Text>
            </View>
          ) : null}
          {syncStates.filter(item => item.error).map(item => (
            <View key={item.id} className="mb-2.5 flex-row items-center gap-3 rounded-[20px] p-3.5" style={{ backgroundColor: statusTint(colors.blocked, 0.1), borderWidth: 1, borderColor: statusTint(colors.blocked, 0.3) }}>
              <CircleAlert color={colors.blocked} size={20} />
              <View className="min-w-0 flex-1">
                <Text className="text-[14.5px] font-semibold text-blocked" numberOfLines={1}>Can’t sync {item.name}</Text>
                <Text accessibilityRole="alert" className="mt-0.5 text-[13px] leading-[18px] text-text2" numberOfLines={3}>
                  {item.error}
                </Text>
              </View>
              <Button className="h-10 min-h-0 rounded-full bg-raised px-3.5" size="content" variant="ghost" onPress={onManageHosts}>
                <Text className="text-[13.5px] font-semibold">Manage servers</Text>
              </Button>
            </View>
          ))}
          {agents.length > 0 ? (
            <ListGroup>
              {agents.map(row => (
                <ChatQueueRow
                  key={`${row.session.id}:${row.agent.pane_id}`}
                  row={row}
                  title={rowTitle(row)}
                  status={chatRowStatus(row, saved.activity)}
                  unseen={chatRowNeedsAttention(row, saved.activity)}
                  updatedAt={chatRowUpdatedAt(row, saved.activity)}
                  showHost={mergedQueue}
                  syncing={chatSyncState(row.session, undefined, !sessions.restoreComplete).loading}
                  onPress={() => {
                    const { session: agentSession, agent, thread, terminalOnly } = row;
                    if (terminalOnly) sessions.openAgentTerminal(agentSession.id, agent);
                    else if (thread && onOpenCodex) onOpenCodex(agentSession.hostId, thread.id);
                    else if (onOpenChat)
                      void onOpenChat({
                        hostId: agentSession.hostId,
                        paneId: agent.pane_id,
                      });
                    else sessions.openAgentTerminal(agentSession.id, agent);
                  }}
                />
              ))}
            </ListGroup>
          ) : (
            <View className="items-center rounded-3xl bg-card px-5 pb-[22px] pt-7">
              <Text className="text-center text-[17px] font-semibold">
                {syncing ? 'Loading your chats'
                  : searching ? `No chats match “${query.trim()}”`
                    : statusFilter === 'blocked' ? 'Nobody needs you right now'
                      : statusFilter === 'working' ? 'Nothing working right now'
                        : statusFilter === 'done' ? 'No new completions'
                          : 'A little room to think'}
              </Text>
              <Text className="mt-1.5 text-center text-sm leading-[21px] text-text2">
                {syncing ? 'Your servers reconnect automatically. Chats appear here as they arrive.'
                  : searching ? 'Try a chat name, agent or folder.'
                    : statusFilter ? 'Tap All to see every chat.'
                      : 'Connect a server, then start a Codex or Claude conversation. Your existing agents appear here too.'}
              </Text>
              {!syncing && !searching && !statusFilter ? (
                <View className="mt-4 flex-row flex-wrap justify-center gap-2">
                  {hosts.length > 0 ? (
                    <ActionButton icon={Bot} label="New agent" accessibilityLabel="Start a new agent" height={44} radius={22} onPress={startNewAgent} />
                  ) : null}
                  <ActionButton label="Manage servers" height={44} radius={22} tone="raised" onPress={onManageHosts} />
                </View>
              ) : null}
            </View>
          )}
        </View>
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
          <View className="min-h-[62px] flex-row items-center gap-1 px-2">
            <Button
              accessibilityLabel="Close new agent"
              disabled={busy}
              variant="ghost"
              size="content"
              className="size-11 rounded-full"
              onPress={() => setCreating(false)}
            >
              <X color={colors.text} size={22} strokeWidth={2} />
            </Button>
            <Text accessibilityRole="header" className="text-[17px] font-semibold">New agent</Text>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            className="flex-1 px-4"
            contentContainerClassName="pb-6"
          >
            <Field label="Server" first>
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
                <ActionButton
                  className="mt-3"
                  disabled={busy}
                  height={46}
                  label="Connect to server"
                  radius={16}
                  tone="card"
                  onPress={() => connect(host)}
                />
              ) : null}
              {!host ? (
                <ActionButton
                  label="Add a server"
                  height={46}
                  radius={16}
                  onPress={() => {
                    setCreating(false);
                    onManageHosts();
                  }}
                />
              ) : null}
            </Field>
            {native ? (
              <Field label="Server readiness">
                <View className="gap-2 rounded-[20px] bg-card p-3.5">
                  {checking ? (
                    <View className="flex-row items-center gap-2.5">
                      <BusySpinner color={colors.working} size={16} />
                      <Text className="text-sm text-working">
                        Checking CLI, login and chat integration…
                      </Text>
                    </View>
                  ) : null}
                  {readiness ? (
                    <>
                      {readiness.version ? (
                        <Text className="font-mono text-[12.5px] text-text2">{readiness.version}</Text>
                      ) : null}
                      {readinessIssues(readiness, provider).length === 0 ? (
                        <View className="flex-row items-center gap-2">
                          <Check color={colors.done} size={16} strokeWidth={2.4} />
                          <Text className="text-sm text-text2">
                            Credentials present · chat integration ready
                          </Text>
                        </View>
                      ) : (
                        readinessIssues(readiness, provider).map(issue => (
                          <View key={issue} className="flex-row items-start gap-2">
                            <CircleAlert color={colors.blocked} size={16} style={{ marginTop: 2 }} />
                            <Text className="flex-1 text-sm text-blocked">
                              {issue}
                            </Text>
                          </View>
                        ))
                      )}
                    </>
                  ) : null}
                  {readinessError ? (
                    <Text className="text-sm text-blocked">
                      {readinessError}
                    </Text>
                  ) : null}
                  <View className="mt-1 flex-row flex-wrap gap-2">
                    <SmallAction
                      icon={RefreshCw}
                      label="Check again"
                      disabled={checking || busy}
                      onPress={() => setCheckRevision(value => value + 1)}
                    />
                    {readiness && readiness.integration !== 'current' ? (
                      <SmallAction
                        icon={Wrench}
                        label="Repair integration"
                        accessibilityLabel="Repair chat integration"
                        disabled={busy || checking}
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
                      />
                    ) : null}
                    <SmallAction
                      icon={SquareTerminal}
                      label="Server terminal"
                      disabled={busy}
                      onPress={() => {
                        if (session) {
                          setCreating(false);
                          sessions.openSshShell(session.id);
                        }
                      }}
                    />
                  </View>
                </View>
              </Field>
            ) : null}
            <Field label="Provider">
              <SegmentedControl
                accessibilityLabel="Provider"
                size="lg"
                options={[
                  { value: 'codex' as const, label: 'Codex' },
                  { value: 'claude' as const, label: 'Claude' },
                ]}
                value={provider}
                onChange={item => {
                  if (busy) return;
                  setPreferences(current => ({
                    ...current,
                    provider: item,
                  }));
                }}
              />
              <Text className="ml-1 mt-2 text-[12.5px] text-text3">
                {provider === 'codex'
                  ? 'Auto-review · workspace access'
                  : 'Auto mode'}
              </Text>
            </Field>
            <Field label="Model">
              <Input
                accessibilityLabel="Model"
                className="font-mono text-[14.5px]"
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
              <Text className="ml-1 mt-2 text-[12.5px] text-text3">
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
              <Text className="ml-1 mt-2 text-[12.5px] text-text3">
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
              <Text className="ml-1 mt-4 text-[12.5px] font-medium text-text3">New workspace folder</Text>
              {directoriesLoading ? (
                <View className="ml-1 mt-2 flex-row items-center gap-2">
                  <BusySpinner color={colors.working} size={14} />
                  <Text className="text-[12.5px] text-working">Loading folders…</Text>
                </View>
              ) : null}
              {directories.length > 10 ? (
                <Input accessibilityLabel="Find project folder" className="mt-2" value={folderFilter} onChangeText={setFolderFilter} placeholder="Find a project…" autoCorrect={false} />
              ) : null}
              <View className="mt-2 flex-row flex-wrap gap-2">
                {directories.filter(folder => folder.label.startsWith('~') || folder.label.toLowerCase().includes(folderFilter.toLowerCase())).map(folder => (
                  <Choice key={folder.path} icon={FolderOpen} mono label={folder.label} disabled={busy} selected={directory === folder.path} onPress={() => setDirectory(folder.path)} />
                ))}
              </View>
              {directoryError ? <Text className="ml-1 mt-2 text-[12.5px] text-text3">Could not load folders. Check the server again or enter a path below.</Text> : null}
              <Input
                accessibilityLabel="New project directory"
                className="mt-2 font-mono text-[14.5px]"
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
                variant="ghost"
                size="content"
                className="mt-5 h-[46px] flex-row gap-2 rounded-2xl bg-card active:bg-raised"
                disabled={!host || busy || !library.loaded}
                onPress={saveFavorite}
              >
                <Star size={17} color={favoriteSaved ? colors.warning : colors.text} fill={favoriteSaved ? colors.warning : 'transparent'} />
                <Text className="text-[14.5px] font-semibold">
                  {favoriteSaved
                    ? 'Favorite saved'
                    : 'Save as favorite project'}
                </Text>
              </Button>
            ) : null}
            {error ? (
              <Text
                accessibilityRole="alert"
                className="ml-1 mt-4 text-[13px] leading-[18px] text-blocked"
              >
                {error}
              </Text>
            ) : null}
          </ScrollView>
          <View className="px-4 pb-3.5 pt-2">
            <ActionButton
              accessibilityLabel="Start conversation"
              busy={busy}
              disabled={busy || !host || session?.connectionStatus !== 'ready'}
              height={54}
              icon={Bot}
              label={busy ? 'Starting…' : 'Start conversation'}
              radius={19}
              onPress={() => reportBackgroundFailure(launch(), 'chat-launch')}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({
  label,
  children,
  first = false,
}: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <View className={first ? 'mt-2' : 'mt-6'}>
      <Text accessibilityRole="header" className="mb-2.5 ml-1 text-[13px] font-semibold text-text2">{label}</Text>
      {children}
    </View>
  );
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
  icon: IconComponent,
  mono = false,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon?: typeof FolderOpen;
  mono?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Button
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      disabled={disabled}
      variant="ghost"
      size="content"
      className={cn('h-10 min-h-0 flex-row gap-1.5 rounded-full px-4', selected ? 'active:opacity-90' : 'bg-card active:bg-raised')}
      style={selected ? { backgroundColor: statusTint(colors.primary, 0.16) } : undefined}
      onPress={onPress}
    >
      {IconComponent ? <IconComponent color={selected ? colors.primary : colors.textTertiary} size={15} /> : null}
      <Text className={cn('text-sm font-semibold', mono && 'font-mono text-[13px]', selected ? 'text-primary' : 'text-text2')}>{label}</Text>
    </Button>
  );
}

function SmallAction({
  label,
  icon: IconComponent,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  icon: typeof RefreshCw;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Button
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      variant="ghost"
      size="content"
      className="h-9 min-h-0 flex-row gap-1.5 rounded-[13px] bg-raised px-3 active:bg-overlay"
      hitSlop={4}
      onPress={onPress}
    >
      <IconComponent color={colors.textSecondary} size={14} />
      <Text className="text-[13px] font-semibold">{label}</Text>
    </Button>
  );
}

/** Server rail chip: 44 tall, accent tint when selected, with the server's aggregate dot. */
function RailChip({
  label,
  count,
  dotColor,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  dotColor?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Button
      accessibilityLabel={`${label}, ${count} ${count === 1 ? 'chat' : 'chats'}`}
      accessibilityState={{ selected }}
      variant="ghost"
      size="content"
      className={cn('h-11 flex-row gap-2 rounded-full px-[15px]', selected ? 'active:opacity-90' : 'bg-card active:bg-raised')}
      style={selected ? { backgroundColor: statusTint(colors.primary, 0.16) } : undefined}
      onPress={onPress}
    >
      {dotColor ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} /> : null}
      <Text className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-text2')} numberOfLines={1}>
        {label}
      </Text>
      <Text className={cn('text-sm font-medium', selected ? 'text-primary' : 'text-text2')} style={{ opacity: 0.65 }}>
        {count}
      </Text>
    </Button>
  );
}

/** Status tile: tap filters the queue; tap again (or All) to clear. */
function StatusTile({
  label,
  count,
  color,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const all = label === 'All';
  return (
    <Button
      accessibilityLabel={`${label}, ${count}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      variant="ghost"
      size="content"
      className="h-[78px] flex-1 flex-col items-start justify-between rounded-[20px] px-3 pb-[11px] pt-3 active:opacity-90"
      style={{
        backgroundColor: selected ? (all ? colors.raised : statusTint(color, 0.14)) : colors.card,
        borderWidth: 1.5,
        borderColor: selected ? (all ? 'rgba(192,202,245,0.22)' : statusTint(color, 0.6)) : 'transparent',
      }}
      onPress={onPress}
    >
      <Text className="text-[26px] font-semibold leading-[26px]" style={{ color, fontVariant: ['tabular-nums'], letterSpacing: -0.52 }}>
        {count}
      </Text>
      <Text className="text-[12.5px] font-medium text-text2" numberOfLines={1}>{label}</Text>
    </Button>
  );
}

const STATUS_LABELS: Record<string, string> = {
  blocked: 'Needs you',
  done: 'Done',
  working: 'Working',
  idle: 'Idle',
  unknown: 'Starting',
};

/** Attention-queue row: medallion · title and meta · status and time · chevron. */
function ChatQueueRow({
  row,
  title,
  status,
  unseen,
  updatedAt,
  showHost,
  syncing,
  onPress,
}: {
  row: ChatRow;
  title: string;
  status: string;
  unseen: boolean;
  updatedAt?: number;
  showHost: boolean;
  syncing: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { session: agentSession, agent, thread, terminalOnly } = row;
  const snapshot = sessionSnapshot(agentSession);
  const accessibleName = thread?.name || snapshot.tabs.find(item => item.tab_id === agent.tab_id)?.label || agent.agent;
  const workspace = snapshot.workspaces.find(item => item.workspace_id === agent.workspace_id);
  const offline = !syncing && agentSession.connectionStatus !== 'ready';
  const color = statusColor(status, colors);
  const provider = agent.agent === 'codex' ? 'codex' : 'claude';
  const path = shortHomePath(thread?.cwd || agent.cwd) || workspace?.label;
  const statusText = offline ? 'Offline' : syncing ? 'Syncing…' : STATUS_LABELS[status] ?? status;
  const time = formatRelativeShort(updatedAt);
  return (
    <Button
      accessibilityLabel={`${terminalOnly ? 'Open terminal' : 'Open chat'} ${accessibleName} on ${hostDisplayName(agentSession.host)}`}
      accessibilityHint={`${statusText}${unseen && status === 'done' ? ', new' : ''}`}
      variant="ghost"
      size="content"
      className="h-auto min-h-[72px] w-full flex-row items-center justify-start gap-3.5 rounded-none py-3 pl-3.5 pr-2 active:bg-raised"
      style={status === 'blocked' ? { backgroundColor: colors.blockedRow } : undefined}
      onPress={onPress}
    >
      <AgentStatusMedallion
        accessibilityLabel={statusText}
        status={offline ? 'idle' : status}
        color={offline ? colors.decor : status === 'idle' ? colors.decor : color}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-base font-semibold leading-[22px]" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-[12.5px] leading-[17px] text-text3" numberOfLines={1}>
          <Text className="text-[12.5px] text-text2">{provider}</Text>
          {showHost ? ` · ${hostDisplayName(agentSession.host)}` : ''}
          {path ? ' · ' : ''}
          {path ? <Text className="font-mono text-xs text-text3">{path}</Text> : null}
          {terminalOnly ? ' · Terminal (chat link unavailable)' : ''}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className="text-[12.5px] font-semibold"
          style={{ color: offline || syncing || status === 'idle' || status === 'unknown' ? colors.textTertiary : color }}
          numberOfLines={1}
        >
          {statusText}
        </Text>
        {time ? <Text className="mt-0.5 text-xs text-text3">{time}</Text> : null}
      </View>
      <ChevronRight color={colors.decor} size={18} strokeWidth={2} />
    </Button>
  );
}

function Banner({ message, tone }: { message: string; tone: 'bad' }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      className="mt-3 flex-row items-start gap-2.5 rounded-[20px] p-3.5"
      style={{ backgroundColor: statusTint(tone === 'bad' ? colors.blocked : colors.primary, 0.1) }}
    >
      <CircleAlert color={colors.blocked} size={18} style={{ marginTop: 1 }} />
      <Text className="flex-1 text-[13px] leading-[18px] text-blocked">{message}</Text>
    </View>
  );
}
