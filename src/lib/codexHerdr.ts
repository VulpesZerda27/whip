import type { SessionRuntimeController } from '../hooks/useSessionRuntimeManager';
import { herdrCodexThreadId } from './codexInbox';

/** Reuse the exact live pane before creating another terminal for a chat. */
export async function openCodexTerminal(
  sessions: Pick<SessionRuntimeController, 'refreshSnapshot' | 'openPaneTerminal' | 'createWorkspace' | 'launchTab'>,
  sessionId: string,
  threadId: string,
  cwd: string,
): Promise<void> {
  const snapshot = await sessions.refreshSnapshot(sessionId);
  if (!snapshot) throw new Error('Wait for the server to reconnect before opening its terminal.');
  const pane = snapshot.panes.find(item => herdrCodexThreadId(item) === threadId);
  if (pane) {
    sessions.openPaneTerminal(sessionId, pane, true);
    return;
  }
  const workspace = await sessions.createWorkspace(sessionId, 'Codex', cwd);
  await sessions.launchTab(sessionId, workspace.workspace_id, 'Codex', {
    type: 'agent', kind: 'codex', args: ['resume', threadId], reverseControl: false,
  });
}
