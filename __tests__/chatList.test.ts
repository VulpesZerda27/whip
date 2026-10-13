import {
  buildChatRows,
  chatDockBadge,
  chatHeadsUpEvents,
  chatRowTitle,
  chatStatusSnapshot,
  chatRowStatus,
  chatStatusCounts,
  formatRelativeShort,
  hostChatDotStatus,
  matchesChatSearch,
  matchesChatStatusFilter,
  sortChatRows,
} from '../src/lib/chatList';
import type { SessionPresentation } from '../src/liveHostSessions';
import { chatFingerprint } from '../src/lib/chatInbox';
import { chatKey } from '../src/services/chatLibrary';
import type { AgentInfo } from '../src/types';

function agent(status: string, pane: string, extra: Partial<AgentInfo> = {}): AgentInfo {
  return { agent: 'claude', agent_status: status, pane_id: pane, tab_id: pane, workspace_id: 'w', terminal_id: `${pane}-t`, ...extra } as AgentInfo;
}

function session(agents: AgentInfo[], overrides: Partial<SessionPresentation> = {}): SessionPresentation {
  return {
    id: 'session-1',
    hostId: 'host-1',
    connectionStatus: 'ready',
    host: { id: 'host-1', name: 'thinker', host: 'thinker.local' },
    snapshot: { server: { running: true }, agents, tabs: [], workspaces: [], panes: [] },
    ...overrides,
  } as unknown as SessionPresentation;
}

describe('chat list', () => {
  test('only chat providers become rows', () => {
    const rows = buildChatRows([session([agent('idle', 'a'), agent('idle', 'b', { agent: 'shell' })])], undefined, {});
    expect(rows.map(row => row.agent.pane_id)).toEqual(['a']);
  });

  test('a seen completion reads as idle and leaves the Done tile', () => {
    const done = agent('done', 'a');
    const rows = buildChatRows([session([done])], undefined, {});
    expect(chatRowStatus(rows[0], {})).toBe('done');
    const seen = { [chatKey('host-1', 'a')]: { fingerprint: chatFingerprint(done), seen: chatFingerprint(done), updatedAt: 1 } };
    expect(chatRowStatus(rows[0], seen)).toBe('idle');
    expect(chatStatusCounts(rows, seen)).toEqual({ all: 1, blocked: 0, working: 0, done: 0 });
  });

  test('tiles count statuses separately and filter by exact status', () => {
    const rows = buildChatRows([session([agent('blocked', 'a'), agent('working', 'b'), agent('done', 'c'), agent('idle', 'd')])], undefined, {});
    expect(chatStatusCounts(rows, {})).toEqual({ all: 4, blocked: 1, working: 1, done: 1 });
    expect(rows.filter(row => matchesChatStatusFilter(chatRowStatus(row, {}), 'working')).map(row => row.agent.pane_id)).toEqual(['b']);
    expect(rows.filter(row => matchesChatStatusFilter(chatRowStatus(row, {}), null))).toHaveLength(4);
  });

  test('sorts needs-you first, then done, working and idle', () => {
    const rows = buildChatRows([session([agent('idle', 'd'), agent('working', 'c'), agent('done', 'b'), agent('blocked', 'a')])], undefined, {});
    expect(sortChatRows(rows, {}).map(row => row.agent.pane_id)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('the dock badge is pink for needs-you, green for an unseen completion, otherwise hidden', () => {
    expect(chatDockBadge(buildChatRows([session([agent('done', 'a'), agent('blocked', 'b')])], undefined, {}), {})).toBe('blocked');
    expect(chatDockBadge(buildChatRows([session([agent('done', 'a'), agent('working', 'b')])], undefined, {}), {})).toBe('done');
    expect(chatDockBadge(buildChatRows([session([agent('working', 'a')])], undefined, {}), {})).toBeNull();
  });

  test('server dots follow connection state before agent state', () => {
    const live = session([agent('working', 'a')]);
    const rows = buildChatRows([live], undefined, {});
    expect(hostChatDotStatus(live, rows, {})).toBe('working');
    expect(hostChatDotStatus({ ...live, connectionStatus: 'error' }, rows, {})).toBe('blocked');
    expect(hostChatDotStatus({ ...live, connectionStatus: 'reconnecting' }, rows, {})).toBe('working');
    expect(hostChatDotStatus({ ...live, connectionStatus: 'disconnected' }, rows, {})).toBeNull();
    expect(hostChatDotStatus(undefined, [], {})).toBeNull();
    const idle = session([agent('idle', 'a')]);
    expect(hostChatDotStatus(idle, buildChatRows([idle], undefined, {}), {})).toBe('done');
    const stopped = session([], { snapshot: { server: { running: false }, agents: [], tabs: [], workspaces: [], panes: [] } } as never);
    expect(hostChatDotStatus(stopped, [], {})).toBe('warning');
  });

  test('search matches title, agent, folder and server', () => {
    const [row] = buildChatRows([session([agent('idle', 'a', { cwd: '/srv/whip-site' })])], undefined, {});
    expect(matchesChatSearch(row, 'docs', 'DOCS')).toBe(true);
    expect(matchesChatSearch(row, 'docs', 'whip-site')).toBe(true);
    expect(matchesChatSearch(row, 'docs', 'claude')).toBe(true);
    expect(matchesChatSearch(row, 'docs', 'thinker')).toBe(true);
    expect(matchesChatSearch(row, 'docs', 'nothing')).toBe(false);
    expect(matchesChatSearch(row, 'docs', '  ')).toBe(true);
  });

  test('formats short relative times', () => {
    const now = 10_000_000_000;
    expect(formatRelativeShort(undefined, now)).toBeUndefined();
    expect(formatRelativeShort(now - 5_000, now)).toBe('now');
    expect(formatRelativeShort(now - 14 * 60_000, now)).toBe('14m');
    expect(formatRelativeShort(now - 3 * 3_600_000, now)).toBe('3h');
    expect(formatRelativeShort(now - 2 * 86_400_000, now)).toBe('2d');
  });
});

describe('chat heads-up events', () => {
  test('alerts only when a known chat starts needing you or finishes', () => {
    const before = buildChatRows([session([agent('working', 'a'), agent('working', 'b'), agent('idle', 'c')])], undefined, {});
    const after = buildChatRows([session([agent('blocked', 'a'), agent('done', 'b'), agent('working', 'c'), agent('blocked', 'new')])], undefined, {});
    const events = chatHeadsUpEvents(chatStatusSnapshot(before, {}), after, {});
    expect(events.map(event => [event.row.agent.pane_id, event.status])).toEqual([['a', 'blocked'], ['b', 'done']]);
  });

  test('does not repeat an unchanged status', () => {
    const rows = buildChatRows([session([agent('blocked', 'a')])], undefined, {});
    expect(chatHeadsUpEvents(chatStatusSnapshot(rows, {}), rows, {})).toEqual([]);
  });

  test('titles prefer the conversation, then the Herdr tab label', () => {
    const live = session([agent('idle', 'a')]);
    Object.assign(live.snapshot, { tabs: [{ tab_id: 'a', label: 'docs' }] });
    const [row] = buildChatRows([live], undefined, {});
    expect(chatRowTitle(row)).toBe('docs');
    expect(chatRowTitle({ ...row, thread: { id: 't', name: 'Exact', cwd: '', updatedAt: 0, status: 'idle' } })).toBe('Exact');
  });
});
