import type { SessionPresentation } from '../liveHostSessions';
import type { ChatActivity } from '../services/chatLibrary';
import { chatKey } from '../services/chatLibrary';
import { codexChatKey, type CodexSnapshot, type CodexThread } from '../services/codexDaemon';
import type { AgentInfo } from '../types';
import { isChatProvider } from './chatLaunch';
import { chatNeedsAttention, chatStatusPriority } from './chatInbox';
import { codexNeedsAttention, herdrCodexThreadId } from './codexInbox';

export interface ChatRow {
  session: SessionPresentation;
  agent: AgentInfo;
  thread?: CodexThread;
  attention?: boolean;
  terminalOnly?: boolean;
}

/** Status tiles on Chats; `null` shows everything. */
export type ChatStatusFilter = 'blocked' | 'working' | 'done' | null;

interface CodexSource {
  sessionId: string;
  snapshot: Pick<CodexSnapshot, 'threads' | 'requests'>;
}

/**
 * Herdr owns list membership; the daemon supplies the exact conversation's
 * contents and activity. Saved daemon history alone never creates a row.
 */
export function buildChatRows(
  sessions: SessionPresentation[],
  codexHosts: CodexSource[] | undefined,
  activity: Record<string, ChatActivity>,
  hostFilter: string | null = null,
): ChatRow[] {
  const rows: ChatRow[] = [];
  for (const live of sessions) {
    if (hostFilter && live.hostId !== hostFilter) continue;
    const codex = codexHosts?.find(item => item.sessionId === live.id);
    const listed = new Set<string>();
    for (const agent of live.snapshot.agents) {
      if (!isChatProvider(agent.agent)) continue;
      if (agent.agent !== 'codex' || !codexHosts) {
        rows.push({ session: live, agent });
        continue;
      }
      const id = herdrCodexThreadId(agent);
      if (!id) {
        rows.push({ session: live, agent, terminalOnly: true });
        continue;
      }
      if (listed.has(id)) continue;
      listed.add(id);
      const known = codex?.snapshot.threads.find(thread => thread.id === id);
      const thread: CodexThread = known ?? {
        id,
        name: live.snapshot.tabs?.find(tab => tab.tab_id === agent.tab_id)?.label || 'Codex',
        cwd: agent.cwd || '',
        updatedAt: 0,
        status: agent.agent_status === 'unknown' ? 'idle' : agent.agent_status,
      };
      const seen = activity[chatKey(live.hostId, codexChatKey(id))];
      const pending = codex?.snapshot.requests.some(r => r.params.threadId === id && r.params.isBlocking !== false) ?? false;
      const attention = known
        ? codexNeedsAttention(thread, pending, seen)
        : chatNeedsAttention(agent, activity[chatKey(live.hostId, agent.pane_id)]);
      const status = pending ? 'blocked'
        : thread.status === 'idle' || thread.status === 'done'
          ? attention ? 'done' : 'idle'
          : thread.status;
      rows.push({ session: live, thread, attention, agent: { ...agent, pane_id: codexChatKey(id), agent_status: status } });
    }
  }
  return rows;
}

export function chatRowActivity(row: ChatRow, activity: Record<string, ChatActivity>): ChatActivity | undefined {
  return activity[chatKey(row.session.hostId, row.agent.pane_id)];
}

export function chatRowNeedsAttention(row: ChatRow, activity: Record<string, ChatActivity>): boolean {
  return row.attention ?? chatNeedsAttention(row.agent, chatRowActivity(row, activity));
}

/** A completion you have already seen reads as idle; an unseen one stays done. */
export function chatRowStatus(row: ChatRow, activity: Record<string, ChatActivity>): string {
  const status: string = row.agent.agent_status;
  if (status === 'done' && !chatRowNeedsAttention(row, activity)) return 'idle';
  // Older Herdr builds and daemon threads may still report these aliases.
  if (status === 'busy' || status === 'running') return 'working';
  return status;
}

/** Milliseconds since the epoch, when the row's last activity is known. */
export function chatRowUpdatedAt(row: ChatRow, activity: Record<string, ChatActivity>): number | undefined {
  if (row.thread?.updatedAt) return row.thread.updatedAt * 1000;
  return chatRowActivity(row, activity)?.updatedAt || undefined;
}

/** Blocked → done → working → idle, then unseen first, then most recent. */
export function sortChatRows(rows: ChatRow[], activity: Record<string, ChatActivity>): ChatRow[] {
  return [...rows].sort((a, b) =>
    chatStatusPriority(chatRowStatus(a, activity)) - chatStatusPriority(chatRowStatus(b, activity)) ||
    Number(chatRowNeedsAttention(b, activity)) - Number(chatRowNeedsAttention(a, activity)) ||
    (chatRowUpdatedAt(b, activity) ?? 0) - (chatRowUpdatedAt(a, activity) ?? 0),
  );
}

export function matchesChatStatusFilter(status: string, filter: ChatStatusFilter): boolean {
  return !filter || status === filter;
}

export function chatStatusCounts(rows: ChatRow[], activity: Record<string, ChatActivity>) {
  const counts = { all: rows.length, blocked: 0, working: 0, done: 0 };
  for (const row of rows) {
    const status = chatRowStatus(row, activity);
    if (status === 'blocked' || status === 'working' || status === 'done') counts[status] += 1;
  }
  return counts;
}

/** Dock badge: pink if any agent needs you, otherwise green for an unseen completion. */
export function chatDockBadge(rows: ChatRow[], activity: Record<string, ChatActivity>): 'blocked' | 'done' | null {
  let done = false;
  for (const row of rows) {
    const status = chatRowStatus(row, activity);
    if (status === 'blocked') return 'blocked';
    if (status === 'done') done = true;
  }
  return done ? 'done' : null;
}

export function matchesChatSearch(row: ChatRow, title: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [title, row.agent.agent, row.thread?.cwd, row.agent.cwd, row.session.host.name, row.session.host.host]
    .some(value => value?.toLowerCase().includes(needle));
}

/** Aggregate status for a server chip's dot, or null for no dot (offline). */
export function hostChatDotStatus(
  session: Pick<SessionPresentation, 'connectionStatus'> & { snapshot: { server: { running: boolean } } } | undefined,
  rows: ChatRow[],
  activity: Record<string, ChatActivity>,
): 'blocked' | 'done' | 'working' | 'warning' | null {
  if (!session) return null;
  switch (session.connectionStatus) {
    case 'error':
      return 'blocked';
    case 'connecting':
    case 'connected':
    case 'reconnecting':
      return 'working';
    case 'disconnected':
      return null;
    case 'ready':
      break;
  }
  const statuses = rows.map(row => chatRowStatus(row, activity));
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('done')) return 'done';
  if (statuses.includes('working')) return 'working';
  if (!session.snapshot.server.running) return 'warning';
  return 'done';
}

/** “now”, “4m”, “3h”, “2d”. */
export function formatRelativeShort(timestamp: number | undefined, now = Date.now()): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) return undefined;
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 60_000) return 'now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}

export function chatRowTitle(row: ChatRow): string {
  return row.thread?.name ||
    row.session.snapshot.tabs?.find(tab => tab.tab_id === row.agent.tab_id)?.label ||
    (row.agent.agent === 'codex' ? 'Codex' : 'Claude');
}

export function chatRowKey(row: ChatRow): string {
  return chatKey(row.session.hostId, row.agent.pane_id);
}

export interface ChatHeadsUp {
  key: string;
  row: ChatRow;
  status: 'blocked' | 'done';
}

/**
 * Status transitions worth a heads-up: a known chat that starts needing you or
 * finishes unseen. Rows seen for the first time never alert, so restoring a
 * session cannot flood the screen.
 */
export function chatHeadsUpEvents(
  previous: ReadonlyMap<string, string>,
  rows: ChatRow[],
  activity: Record<string, ChatActivity>,
): ChatHeadsUp[] {
  const events: ChatHeadsUp[] = [];
  for (const row of rows) {
    const key = chatRowKey(row);
    const before = previous.get(key);
    const status = chatRowStatus(row, activity);
    if (before === undefined || before === status) continue;
    if (status === 'blocked' || status === 'done') events.push({ key, row, status });
  }
  return events;
}

export function chatStatusSnapshot(rows: ChatRow[], activity: Record<string, ChatActivity>): Map<string, string> {
  return new Map(rows.map(row => [chatRowKey(row), chatRowStatus(row, activity)]));
}
