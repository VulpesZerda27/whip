import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useCodexHosts } from '../src/hooks/useCodexHosts';
import { codexClient, type CodexDaemonClient, type CodexSnapshot } from '../src/services/codexDaemon';
import { alertAgent } from '../src/services/alerts';
import type { SessionRuntimeController } from '../src/hooks/useSessionRuntimeManager';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ AppState: { currentState: 'active' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('../src/hooks/useAppForeground', () => ({ useAppForeground: () => true }));
jest.mock('../src/services/codexDaemon', () => ({ ...jest.requireActual('../src/services/codexDaemon'), codexClient: jest.fn() }));
jest.mock('../src/services/alerts', () => ({ alertAgent: jest.fn(async () => {}), dismissAgentAlertsForPane: jest.fn(async () => {}) }));
jest.mock('../src/services/backgroundOperations', () => ({ reportBackgroundFailure: (p: Promise<void>) => p }));

test('closed Codex history cannot generate new notifications, including after a pane closes', async () => {
  const threads = ['open', 'closed'].map(id => ({ id, name: id, cwd: '/same/project', updatedAt: 1, status: 'idle' as const }));
  let notify!: () => void;
  const client = { snapshot: { connected: true, threads, requests: [] } as unknown as CodexSnapshot,
    subscribe: (listener: () => void) => { notify = listener; return () => {}; }, start: jest.fn(), stop: jest.fn() };
  jest.mocked(codexClient).mockReturnValue(client as unknown as CodexDaemonClient);
  const session = { id: 'session', hostId: 'host', host: { name: 'Server' }, connectionStatus: 'ready', hostState: { freshness: 'fresh' },
    snapshot: { agents: [{ agent: 'codex', agent_session: { agent: 'codex', kind: 'id', source: 'herdr:codex', value: 'open' } }] } };
  const native = {};
  const sessions = { presentationSessions: [session], getClient: () => ({ native }) };
  function Harness() {
    useCodexHosts(sessions as unknown as SessionRuntimeController, true, { alertsEnabled: true, agentAlertLevel: 'regular', persistentAlertDurationSeconds: 30, ttsEnabled: false });
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Harness />); });
  await act(async () => {
    client.snapshot = { ...client.snapshot, threads: threads.map(t => ({ ...t, status: 'done' })) };
    notify();
  });
  expect(alertAgent).toHaveBeenCalledTimes(1);
  expect(jest.mocked(alertAgent).mock.calls[0][2]).toEqual({ hostId: 'host', paneId: 'codex-thread:open' });
  session.snapshot.agents = [];
  await act(async () => { renderer.update(<Harness />); });
  await act(async () => {
    client.snapshot = { ...client.snapshot, threads: threads.map(t => ({ ...t, status: 'working' })) };
    notify();
  });
  await act(async () => {
    client.snapshot = { ...client.snapshot, threads: threads.map(t => ({ ...t, status: 'done' })) };
    notify();
  });
  expect(alertAgent).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});
