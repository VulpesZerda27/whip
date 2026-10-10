import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ChatLibraryController } from './useChatLibrary';
import type { SessionRuntimeController } from './useSessionRuntimeManager';
import type { AppNavigationController } from './useAppNavigation';
import type { HostProfile } from '../types';
import { chatKey, type RecentChat } from '../services/chatLibrary';
import { chatFingerprint } from '../lib/chatInbox';
import { isChatProvider } from '../lib/chatLaunch';
import { sessionSnapshot } from '../liveHostSessions';
import { useAppForeground } from './useAppForeground';

export function useChatExperience(
  library: ChatLibraryController,
  sessions: SessionRuntimeController,
  navigation: AppNavigationController,
  hosts: HostProfile[],
  activePaneId: string | undefined,
  enabled: boolean,
) {
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const opening = useRef(false);
  const resumed = useRef(false);
  const currentNavigation = useRef(navigation.state);
  currentNavigation.current = navigation.state;
  const foreground = useAppForeground();
  const { loaded: libraryLoaded, update: updateLibrary } = library;
  const chatVisible =
    foreground &&
    enabled &&
    navigation.state.tab === 'terminal' &&
    navigation.state.lastNonTerminalTab === 'chats';
  const activeHostId = chatVisible ? sessions.activeSession?.hostId : undefined;

  useEffect(() => {
    if (!libraryLoaded || !enabled) return;
    updateLibrary(previous => {
      const activity = { ...previous.activity };
      let lastChat = previous.lastChat;
      let changed = false;
      for (const session of sessions.presentationSessions) {
        for (const agent of session.snapshot.agents) {
          if (!isChatProvider(agent.agent)) continue;
          const key = chatKey(session.hostId, agent.pane_id);
          const fingerprint = chatFingerprint(agent);
          const old = activity[key];
          const selected =
            session.hostId === activeHostId && agent.pane_id === activePaneId;
          const seen = selected ? fingerprint : (old?.seen ?? '');
          if (old?.fingerprint !== fingerprint || old.seen !== seen) {
            activity[key] = {
              fingerprint,
              seen,
              updatedAt:
                old?.fingerprint === fingerprint ? old.updatedAt : Date.now(),
            };
            changed = true;
          }
          if (selected) {
            const label =
              session.snapshot.tabs.find(tab => tab.tab_id === agent.tab_id)
                ?.label || agent.agent;
            if (
              lastChat?.hostId !== session.hostId ||
              lastChat.paneId !== agent.pane_id ||
              lastChat.label !== label
            ) {
              lastChat = {
                hostId: session.hostId,
                paneId: agent.pane_id,
                label,
              };
              changed = true;
            }
          }
        }
      }
      return changed
        ? {
            ...previous,
            lastChat,
            activity: Object.fromEntries(
              Object.entries(activity)
                .sort(([, a], [, b]) => a.updatedAt - b.updatedAt)
                .slice(-300),
            ),
          }
        : previous;
    });
  }, [
    libraryLoaded,
    updateLibrary,
    sessions.presentationSessions,
    activeHostId,
    activePaneId,
    enabled,
  ]);

  const open = async (target: RecentChat) => {
    if (opening.current || !enabled) return;
    opening.current = true;
    setResuming(true);
    setError(null);
    const startedAtNavigation = navigation.state;
    try {
      const host = hosts.find(item => item.id === target.hostId);
      if (!host)
        throw new Error(
          'This server was removed. Add it in Hosts to reconnect.',
        );
      let session = sessions
        .getState()
        .sessions.find(item => item.hostId === host.id);
      if (session?.connectionStatus !== 'ready') {
        await sessions.connectSavedHost(host, { navigate: false });
        session = sessions
          .getState()
          .sessions.find(item => item.hostId === host.id);
        if (session?.connectionStatus === 'connected')
          await sessions.startServer(session.id);
        session = sessions
          .getState()
          .sessions.find(item => item.hostId === host.id);
      }
      const pane =
        session &&
        sessionSnapshot(session).panes.find(
          item => item.pane_id === target.paneId,
        );
      if (currentNavigation.current !== startedAtNavigation) return;
      if (session?.connectionStatus !== 'ready')
        throw new Error(
          'Server is offline. Reconnect and try again; your agent keeps running on the server.',
        );
      if (!pane || !isChatProvider(pane.agent))
        throw new Error(
          'This conversation is no longer running. Choose another chat or start a new agent.',
        );
      sessions.openPaneTerminal(session.id, pane, true);
      navigation.showChat();
    } catch (reason) {
      if (currentNavigation.current !== startedAtNavigation) return;
      setError(String(reason));
      navigation.selectTab('chats');
    } finally {
      opening.current = false;
      setResuming(false);
    }
  };
  const resumeAtStartup = useEffectEvent(() => {
    if (
      resumed.current ||
      !foreground ||
      !enabled ||
      !library.loaded ||
      !sessions.restoreComplete
    )
      return;
    resumed.current = true;
    const target = library.value.lastChat;
    if (
      !library.value.resumeOnLaunch ||
      !target ||
      navigation.state.tab !== 'chats'
    )
      return;
    // Startup restoration already reconnects saved live hosts. Never hijack a
    // later navigation after waiting on an offline server.
    const session = sessions.presentationSessions.find(
      item => item.hostId === target.hostId,
    );
    const pane = session?.snapshot.panes.find(
      item => item.pane_id === target.paneId,
    );
    if (
      session?.connectionStatus === 'ready' &&
      pane &&
      isChatProvider(pane.agent)
    ) {
      sessions.openPaneTerminal(session.id, pane, true);
      navigation.showChat();
    }
  });
  useEffect(() => {
    resumeAtStartup();
  }, [library.loaded, sessions.restoreComplete, enabled, foreground]);
  return { open, error, resuming };
}
