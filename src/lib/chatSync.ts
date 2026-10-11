import type { SessionPresentation } from '../liveHostSessions';
import type { CodexSnapshot } from '../services/codexDaemon';

export function chatSyncState(
  session: Pick<SessionPresentation, 'connectionStatus' | 'connectionError'>,
  codex?: Pick<CodexSnapshot, 'connected' | 'error'>,
  restoring = false,
): { loading: boolean; error?: string } {
  if (restoring && session.connectionStatus === 'disconnected')
    return { loading: true };
  switch (session.connectionStatus) {
    case 'connecting':
    case 'connected':
    case 'reconnecting':
      return { loading: true };
    case 'ready':
      return {
        loading: Boolean(codex && !codex.connected && !codex.error),
        error: codex?.error,
      };
    case 'disconnected':
    case 'error':
      return {
        loading: false,
        error: session.connectionError || 'Server is offline.',
      };
  }
}
