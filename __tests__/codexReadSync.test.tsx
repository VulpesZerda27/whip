import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useCodexReadSync } from '../src/hooks/useCodexReadSync';
import { codexFingerprint, updateCodexActivity } from '../src/lib/codexInbox';
import { emptyChatLibrary, chatKey } from '../src/services/chatLibrary';
import { codexChatKey, type CodexThread } from '../src/services/codexDaemon';
import type { CodexHost } from '../src/hooks/useCodexHosts';
import type { SessionRuntimeController } from '../src/hooks/useSessionRuntimeManager';
import type { ChatLibraryController } from '../src/hooks/useChatLibrary';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('../src/services/alerts', () => ({
  dismissAgentAlertsForPane: jest.fn(async () => {}),
}));
jest.mock('../src/services/backgroundOperations', () => ({
  reportBackgroundFailure: (p: Promise<void>) => p,
}));

let renderer: ReactTestRenderer;
const thread: CodexThread = {
  id: 'exact-id',
  name: 'Chat',
  cwd: '/project',
  updatedAt: 12,
  status: 'done',
};
const key = chatKey('host', codexChatKey(thread.id));
function setup() {
  const agent = {
    agent: 'codex',
    agent_status: 'idle',
    pane_id: 'p',
    state_change_seq: 4,
    agent_session: {
      agent: 'codex',
      source: 'herdr:codex',
      kind: 'id',
      value: thread.id,
    },
  };
  const session = {
    id: 'session',
    connectionStatus: 'ready',
    hostState: { connectionGeneration: 1, freshness: 'fresh' },
    snapshot: { agents: [agent] },
  };
  const snapshot = {
    connected: true,
    connectionId: 'one',
    threads: [{ ...thread }],
    requests: [],
  };
  const host = {
    hostId: 'host',
    sessionId: 'session',
    snapshot,
    client: { snapshot },
  } as unknown as CodexHost;
  const sessions = {
    presentationSessions: [session],
    refreshSnapshot: jest.fn(async () => session.snapshot),
  };
  const library: ChatLibraryController = {
    loaded: true,
    error: null,
    value: updateCodexActivity(emptyChatLibrary, [
      { hostId: 'host', threads: [{ ...thread, updatedAt: 10 }] },
    ]),
    update: change => {
      library.value = change(library.value);
    },
  };
  library.value = updateCodexActivity(library.value, [
    { hostId: 'host', threads: [thread] },
  ]);
  function Harness() {
    useCodexReadSync(
      [host],
      sessions as unknown as SessionRuntimeController,
      library,
      true,
    );
    return null;
  }
  return { agent, session, snapshot, sessions, library, Harness };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => renderer?.unmount());
  jest.useRealTimers();
});

test('fresh, stable Herdr seen state acknowledges only that completion and stops polling once read', async () => {
  const f = setup();
  await act(async () => {
    renderer = create(<f.Harness />);
  });
  expect(f.library.value.activity[key].seen).not.toBe(codexFingerprint(thread));
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(f.library.value.activity[key].seen).toBe(codexFingerprint(thread));
  const calls = f.sessions.refreshSnapshot.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });
  expect(f.sessions.refreshSnapshot).toHaveBeenCalledTimes(calls);
});

test.each([
  'new completion',
  'reconnect',
  'unread in Herdr',
  'different conversation',
  'cached snapshot',
])('ignores an obsolete read receipt after %s', async change => {
  const f = setup();
  await act(async () => {
    renderer = create(<f.Harness />);
  });
  let resolve!: (value: typeof f.session.snapshot) => void;
  f.sessions.refreshSnapshot.mockImplementationOnce(
    () =>
      new Promise(r => {
        resolve = r;
      }),
  );
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  if (change === 'new completion')
    f.snapshot.threads = [{ ...thread, updatedAt: 20 }];
  if (change === 'cached snapshot') f.session.hostState.freshness = 'stale';
  if (change === 'reconnect') f.session.connectionStatus = 'reconnecting';
  if (change === 'unread in Herdr') f.agent.agent_status = 'done';
  if (change === 'different conversation')
    f.agent.agent_session.value = 'other-id';
  await act(async () => {
    resolve(f.session.snapshot);
  });
  expect(f.library.value.activity[key].seen).not.toBe(codexFingerprint(thread));
});
