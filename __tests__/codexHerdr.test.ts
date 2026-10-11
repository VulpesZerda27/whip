import { openCodexTerminal } from '../src/lib/codexHerdr';
import { herdrCodexThreadId, herdrCodexThreadIds } from '../src/lib/codexInbox';
import type { AgentInfo, PaneInfo } from '../src/types';
import type { SessionRuntimeController } from '../src/hooks/useSessionRuntimeManager';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
const pane = {
  agent: 'codex', pane_id: 'pane', terminal_id: 'terminal', agent_status: 'idle',
  agent_session: { agent: 'codex', source: 'herdr:codex', kind: 'id', value: 'exact' },
} as PaneInfo;

test('membership requires an exact integration ID, independent of running/idle status, title and cwd', () => {
  expect(herdrCodexThreadId(pane)).toBe('exact');
  expect([...herdrCodexThreadIds([pane, { ...pane, agent_status: 'blocked' }] as AgentInfo[])]).toEqual(['exact']);
  for (const changes of [
    { agent: 'claude' }, { agent_session: undefined },
    { agent_session: { ...pane.agent_session!, source: 'custom' } },
    { agent_session: { ...pane.agent_session!, kind: 'path' } },
    { agent_session: { ...pane.agent_session!, agent: 'claude' } },
  ]) expect(herdrCodexThreadId({ ...pane, ...changes } as PaneInfo)).toBeUndefined();
});

test.each(['linked', 'closed', 'unlinked', 'disconnected'])('opening a %s terminal uses fresh Herdr membership', async kind => {
  const sessions = {
    refreshSnapshot: jest.fn(async () => kind === 'disconnected' ? null : { panes: kind === 'linked' ? [pane] : kind === 'unlinked' ? [{ ...pane, agent_session: undefined }] : [] }),
    openPaneTerminal: jest.fn(),
    createWorkspace: jest.fn(async () => ({ workspace_id: 'new-workspace' })),
    launchTab: jest.fn(async () => {}),
  };
  const action = openCodexTerminal(sessions as unknown as SessionRuntimeController, 'selected-server', 'exact', '/project');
  if (kind === 'disconnected') {
    await expect(action).rejects.toThrow('reconnect');
  } else await action;
  expect(sessions.refreshSnapshot).toHaveBeenCalledWith('selected-server');
  if (kind === 'linked') {
    expect(sessions.openPaneTerminal).toHaveBeenCalledWith('selected-server', pane, true);
    expect(sessions.createWorkspace).not.toHaveBeenCalled();
    expect(sessions.launchTab).not.toHaveBeenCalled();
  } else if (kind === 'disconnected') {
    expect(sessions.openPaneTerminal).not.toHaveBeenCalled();
    expect(sessions.createWorkspace).not.toHaveBeenCalled();
  } else {
    expect(sessions.openPaneTerminal).not.toHaveBeenCalled();
    expect(sessions.launchTab).toHaveBeenCalledWith('selected-server', 'new-workspace', 'Codex', {
      type: 'agent', kind: 'codex', args: ['resume', 'exact'], reverseControl: false,
    });
  }
});
