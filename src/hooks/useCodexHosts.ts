import { useEffect, useEffectEvent, useState } from 'react';
import { AppState } from 'react-native';
import type { SessionRuntimeController } from './useSessionRuntimeManager';
import {
  codexChatKey,
  codexClient,
  type CodexSnapshot,
  type CodexDaemonClient,
} from '../services/codexDaemon';
import { useAppForeground } from './useAppForeground';
import { alertAgent, dismissAgentAlertsForPane } from '../services/alerts';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import type { AgentAlertLevel } from '../services/devicePreferences';
import type { AgentInfo } from '../types';
import { herdrCodexThreadIds } from '../lib/codexInbox';

export interface CodexHost {
  hostId: string;
  sessionId: string;
  name: string;
  client: CodexDaemonClient;
  snapshot: CodexSnapshot;
}
interface Alerts {
  alertsEnabled: boolean;
  agentAlertLevel: AgentAlertLevel;
  persistentAlertDurationSeconds: number;
  ttsEnabled: boolean;
}
export function useCodexHosts(
  sessions: SessionRuntimeController,
  enabled: boolean,
  alerts: Alerts,
): CodexHost[] {
  const foreground = useAppForeground();
  const [, update] = useState(0);
  const connections = sessions.presentationSessions
    .map(session => ({
      session,
      native: sessions.getClient(session.id)?.activeNative,
    }))
    .filter(v => v.native);
  const identity = connections
    .map(v => `${v.session.id}:${v.session.connectionStatus}`)
    .join('|');
  const monitor = (enabled && foreground) || alerts.alertsEnabled;
  const notify = useEffectEvent(
    (hostId: string, client: CodexDaemonClient, before: CodexSnapshot) => {
      const after = client.snapshot;
      if (!alerts.alertsEnabled || !after.connected) return;
      const session = sessions.presentationSessions.find(s => s.hostId === hostId);
      if (session?.connectionStatus !== 'ready' || session.hostState?.freshness !== 'fresh') return;
      const open = herdrCodexThreadIds(session.snapshot.agents);
      for (const thread of after.threads) {
        if (!open.has(thread.id)) continue;
        const old = before.threads.find(t => t.id === thread.id);
        if (!old) continue;
        const status = after.requests.some(
          r => r.params.threadId === thread.id && r.params.isBlocking !== false,
        )
          ? 'blocked'
          : thread.status;
        const previous = before.requests.some(
          r => r.params.threadId === thread.id && r.params.isBlocking !== false,
        )
          ? 'blocked'
          : old.status;
        if (status === previous) continue;
        const paneId = codexChatKey(thread.id);
        if (status !== 'done' && status !== 'blocked') {
          reportBackgroundFailure(
            dismissAgentAlertsForPane(hostId, paneId),
            'codex-alert-dismiss',
          );
          continue;
        }
        reportBackgroundFailure(
          alertAgent(
            {
              agent: 'codex',
              agent_status: status,
              pane_id: paneId,
              tab_id: paneId,
            } as AgentInfo,
            alerts.ttsEnabled,
            { hostId, paneId },
            thread.name,
            alerts.agentAlertLevel === 'regular'
              ? 'regular'
              : AppState.currentState === 'active'
                ? 'brief'
                : 'persistent',
            alerts.persistentAlertDurationSeconds * 1000,
          ),
          'codex-alert',
        );
      }
    },
  );
  useEffect(() => {
    const stops = connections.map(({ session, native }) => {
      const client = codexClient(native!);
      let previous = client.snapshot;
      const stop = client.subscribe(() => {
        const next = client.snapshot;
        // Open chats subscribe to their own transcript. Streamed replies must not
        // re-render the whole shell; only list, status and connection state do.
        const listChanged =
          next.threads !== previous.threads ||
          next.requests !== previous.requests ||
          next.connected !== previous.connected ||
          next.connectionId !== previous.connectionId ||
          next.error !== previous.error;
        if (listChanged) notify(session.hostId, client, previous);
        previous = next;
        if (listChanged) update(v => v + 1);
      });
      if (monitor && session.connectionStatus === 'ready') client.start();
      else {
        client.stop();
        if (session.connectionStatus !== 'ready')
          client.offline();
      }
      return () => {
        stop();
        client.stop();
      };
    });
    return () => stops.forEach(stop => stop());
    // Host runtime wrappers retain identity through SSH reconnections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, monitor]);
  return connections.map(({ session, native }) => {
    const client = codexClient(native!);
    return {
      hostId: session.hostId,
      sessionId: session.id,
      name: session.host.name || session.host.host,
      client,
      snapshot: client.snapshot,
    };
  });
}
