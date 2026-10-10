import { useEffect, useEffectEvent, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import type { useAgentNotifications } from './useAgentNotifications';
import type { SessionRuntimeController } from './useSessionRuntimeManager';
import type { HostManagementController } from './useHostManagement';
import { parseAgentNotificationTarget } from '../lib/notificationNavigation';

export function useCodexNotificationNavigation(
  notifications: ReturnType<typeof useAgentNotifications> | undefined,
  enabled: boolean,
  sessions: SessionRuntimeController,
  hosts: HostManagementController,
  open: (hostId: string, threadId: string) => void,
  onLegacyTarget: () => void,
) {
  const opening = useRef(false);
  const navigate = useEffectEvent(async () => {
    if (!notifications?.response || !enabled || opening.current) return;
    const target = parseAgentNotificationTarget(
      notifications.response,
      Notifications.DEFAULT_ACTION_IDENTIFIER,
    );
    if (target && !target.paneId.startsWith('codex-thread:')) {
      onLegacyTarget();
      return;
    }
    if (
      !target?.paneId.startsWith('codex-thread:') ||
      notifications.wasHandled(target.notificationId)
    )
      return;
    const host = hosts.hosts.find(h => h.id === target.hostId);
    if (!host) return;
    opening.current = true;
    try {
      if (
        !sessions.presentationSessions.some(
          s => s.hostId === host.id && s.connectionStatus === 'ready',
        )
      ) {
        await sessions.connectSavedHost(host, { navigate: false });
      }
      hosts.closeEditor();
      open(host.id, target.paneId.slice('codex-thread:'.length));
      notifications.consume(target.notificationId);
    } catch (error) {
      hosts.setError(String(error));
    } finally {
      opening.current = false;
    }
  });
  useEffect(() => {
    void navigate();
  }, [notifications?.response, enabled]);
}
