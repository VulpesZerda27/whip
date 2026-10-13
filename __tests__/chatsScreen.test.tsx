import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ChatsScreen } from '../src/components/ChatsScreen';
import { checkChatReadiness } from '../src/services/chatReadiness';
import { emptyChatLibrary } from '../src/services/chatLibrary';
import type { SessionRuntimeController } from '../src/hooks/useSessionRuntimeManager';
import type { HostProfile } from '../src/types';
import {
  defaultChatLaunchPreferences,
  saveChatLaunchPreferences,
} from '../src/services/chatLaunchPreferences';

jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  ActivityIndicator: 'Spinner',
  Platform: { OS: 'android' },
  Alert: { alert: jest.fn() },
}));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('../src/lib/hostProfiles', () => ({
  hostDisplayName: (host: HostProfile) => host.name || host.host,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_target, name) => String(name) }),
);
jest.mock('../src/theme', () => ({
  useTheme: () => ({ colors: {} }),
  statusColor: (status: string) => status,
  statusTint: (color: string) => color,
  nightfallShadows: {},
}));
jest.mock('../src/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('../src/components/ui/input', () => ({ Input: 'Input' }));
jest.mock('../src/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('../src/components/app-ui', () => ({ AgentStatusMedallion: 'AgentStatusMedallion' }));
jest.mock('../src/components/ChatSkeleton', () => ({ ChatRowSkeleton: 'ChatRowSkeleton', ChatSkeleton: 'ChatSkeleton' }));
jest.mock('../src/components/nightfall', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ActionButton: ({ label, accessibilityLabel, onPress, disabled }: { label: string; accessibilityLabel?: string; onPress: () => unknown; disabled?: boolean }) =>
      createElement('Button', { accessibilityLabel: accessibilityLabel ?? label, onPress, disabled }),
    BusySpinner: 'BusySpinner',
    ListGroup: ({ children }: { children: unknown }) => createElement('ListGroup', null, children),
    SectionLabel: 'SectionLabel',
    SegmentedControl: ({ options, onChange }: { options: { value: string; label: string }[]; onChange: (value: string) => void }) =>
      options.map(option => createElement('Button', { key: option.value, accessibilityLabel: option.label, onPress: () => onChange(option.value) })),
  };
});
jest.mock('../src/services/backgroundOperations', () => ({
  reportBackgroundFailure: (promise: Promise<void>) => promise,
}));
jest.mock('../src/services/chatReadiness', () => ({
  checkChatReadiness: jest.fn(async () => ({ cli: 'ready', version: 'CLI', integration: 'current' })),
  readinessIssues: jest.fn(() => []),
}));
jest.mock('../src/services/chatCatalog', () => ({
  fetchChatCatalog: jest.fn(async () => [{ id: 'sonnet', label: 'Sonnet from server', efforts: ['default', 'high'] }]),
}));
jest.mock('../src/services/chatDirectories', () => ({
  fetchChatDirectories: jest.fn(async () => [
    { label: '~', path: '/home/test' }, { label: '~/Projects', path: '/home/test/Projects' },
    { label: 'mobile', path: '/home/test/Projects/mobile' },
  ]),
}));
jest.mock('../src/services/chatLaunchPreferences', () => ({
  defaultChatLaunchPreferences: {
    provider: 'codex',
    hostId: '',
    providers: {
      codex: { model: '', effort: 'default' },
      claude: { model: '', effort: 'default' },
    },
  },
  loadChatLaunchPreferences: jest.fn(async () => ({
    provider: 'codex',
    hostId: '',
    providers: {
      codex: { model: '', effort: 'default' },
      claude: { model: '', effort: 'default' },
    },
  })),
  saveChatLaunchPreferences: jest.fn(async () => undefined),
}));

let renderer: ReactTestRenderer;
const hosts = ['First', 'Second'].map(
  (name, index) =>
    ({ id: `host-${index}`, name, host: 'example.test' }) as HostProfile,
);
function setup() {
  const native = { remoteHome: jest.fn(async () => '/home/test'), listDirectory: jest.fn(async (path: string) => ({ path })) };
  const sessions = {
    restoreComplete: true,
    getClient: jest.fn(() => ({ native })),
    presentationSessions: hosts.map(host => ({
      id: `session-${host.id}`,
      hostId: host.id,
      host,
      connectionStatus: 'ready',
      snapshot: {
        server: { running: true },
        agents: [],
        workspaces: [
          { workspace_id: `workspace-${host.id}`, label: host.name },
        ],
      },
    })),
    connectingHostIds: new Set(),
    launchTab: jest.fn(async (): Promise<void> => {}),
    openAgentTerminal: jest.fn(),
    createWorkspace: jest.fn(async () => ({ workspace_id: 'new-workspace' })),
  };
  return { sessions, onShowChats: jest.fn() };
}
const button = (label: string) =>
  renderer.root
    .findAll(
      node =>
        String(node.type) === 'Button' &&
        node.props.accessibilityLabel === label,
    )
    .at(-1)!;
const input = (label: string) =>
  renderer.root.find(
    node =>
      String(node.type) === 'Input' && node.props.accessibilityLabel === label,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(checkChatReadiness).mockResolvedValue({ cli: 'ready', version: 'CLI', integration: 'current' });
});

test('readiness failures do not create a workspace or launch an agent', async () => {
  const { sessions, onShowChats } = setup();
  jest.mocked(checkChatReadiness).mockResolvedValue({ cli: 'login-required', version: 'CLI', integration: 'current' });
  await act(async () => {
    renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} />);
  });
  act(() => { button('New agent').props.onPress(); });
  await act(async () => { await button('Start conversation').props.onPress(); });
  expect(sessions.launchTab).not.toHaveBeenCalled();
  expect(sessions.createWorkspace).not.toHaveBeenCalled();
});

test('a favorite loads its exact server, provider, model, effort and directory', async () => {
  const { sessions, onShowChats } = setup();
  const favorite = { id: 'favorite', label: 'Website', hostId: hosts[1].id, directory: '/srv/website', workspaceId: '', provider: 'claude' as const, model: 'sonnet', effort: 'high' as const };
  const library = { value: { ...emptyChatLibrary, favorites: [favorite] }, loaded: true, error: null, update: jest.fn() };
  await act(async () => {
    renderer = create(<ChatsScreen library={library} hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} />);
  });
  await act(async () => { button('Start favorite Website').props.onPress(); });
  expect(input('Model').props.value).toBe('sonnet');
  expect(input('New project directory').props.value).toBe('/srv/website');
  await act(async () => { await button('Start conversation').props.onPress(); });
  expect(sessions.createWorkspace).toHaveBeenCalledWith('session-host-1', 'Website', '/srv/website');
  expect(sessions.launchTab).toHaveBeenCalledWith('session-host-1', 'new-workspace', 'Website', expect.objectContaining({ kind: 'claude', args: expect.arrayContaining(['--effort', 'high']) }), 'chat');
});
afterEach(() => act(() => renderer?.unmount()));

test('launch targets the selected server and workspace with that provider’s options', async () => {
  const { sessions, onShowChats } = setup();
  await act(async () => {
    renderer = create(
      <ChatsScreen
        hosts={hosts}
        sessions={sessions as unknown as SessionRuntimeController}
        onManageHosts={jest.fn()}
        onShowChats={onShowChats}
      />,
    );
  });
  act(() => { button('New agent').props.onPress(); });
  act(() => { button('Second').props.onPress(); });
  await act(async () => { button('Claude').props.onPress(); });
  act(() => { input('Model').props.onChangeText('sonnet'); });
  act(() => { button('high').props.onPress(); });
  await act(async () => {
    await button('Start conversation').props.onPress();
  });
  expect(sessions.launchTab).toHaveBeenCalledWith(
    'session-host-1',
    'workspace-host-1',
    '',
    {
      type: 'agent',
      kind: 'claude',
      reverseControl: false,
      args: [
        '--permission-mode',
        'auto',
        '--model',
        'sonnet',
        '--effort',
        'high',
      ],
    },
    'chat',
  );
  expect(saveChatLaunchPreferences).toHaveBeenCalledWith({
    ...defaultChatLaunchPreferences,
    provider: 'claude',
    hostId: 'host-1',
    providers: {
      ...defaultChatLaunchPreferences.providers,
      claude: { model: 'sonnet', effort: 'high' },
    },
  });
});

test('a double tap cannot create two agents while launch is pending', async () => {
  const { sessions, onShowChats } = setup();
  let finish!: () => void;
  sessions.launchTab.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    renderer = create(
      <ChatsScreen
        hosts={hosts}
        sessions={sessions as unknown as SessionRuntimeController}
        onManageHosts={jest.fn()}
        onShowChats={onShowChats}
      />,
    );
  });
  act(() => { button('New agent').props.onPress(); });
  let first!: Promise<void>;
  await act(async () => {
    first = button('Start conversation').props.onPress();
    await button('Start conversation').props.onPress();
  });
  expect(sessions.launchTab).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await first;
  });
});

test('a failed launch reuses a newly created workspace on retry', async () => {
  const { sessions, onShowChats } = setup();
  sessions.launchTab.mockRejectedValueOnce(new Error('Agent is not installed'));
  await act(async () => {
    renderer = create(
      <ChatsScreen
        hosts={hosts}
        sessions={sessions as unknown as SessionRuntimeController}
        onManageHosts={jest.fn()}
        onShowChats={onShowChats}
      />,
    );
  });
  act(() => { button('New agent').props.onPress(); });
  act(() => { input('New project directory').props.onChangeText('/srv/project'); });
  await act(async () => {
    await button('Start conversation').props.onPress();
  });
  expect(sessions.createWorkspace).toHaveBeenCalledTimes(1);
  expect(sessions.launchTab).toHaveBeenLastCalledWith(
    'session-host-0',
    'new-workspace',
    '',
    expect.anything(),
    'chat',
  );
  // Retrying must use the created workspace even before its snapshot event arrives.
  await act(async () => {
    await button('Start conversation').props.onPress();
  });
  expect(sessions.createWorkspace).toHaveBeenCalledTimes(1);
  expect(sessions.launchTab).toHaveBeenLastCalledWith(
    'session-host-0',
    'new-workspace',
    '',
    expect.anything(),
    'chat',
  );
});

test('a fetched project folder launches an absolute path on the selected server', async () => {
  const { sessions, onShowChats } = setup();
  await act(async () => { renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} />); });
  await act(async () => { button('New agent').props.onPress(); });
  await act(async () => { button('mobile').props.onPress(); });
  expect(input('New project directory').props.value).toBe('/home/test/Projects/mobile');
  await act(async () => { await button('Start conversation').props.onPress(); });
  expect(sessions.createWorkspace).toHaveBeenCalledWith('session-host-0', 'mobile', '/home/test/Projects/mobile');
});

test('chats sort blocked, done, working, then idle', async () => {
  const { sessions, onShowChats } = setup();
  Object.assign(sessions.presentationSessions[0].snapshot, {
    agents: ['idle', 'done', 'working', 'blocked'].map((status, i) => ({
      agent: 'claude', agent_status: status, pane_id: `p${i}`, tab_id: status,
      workspace_id: 'workspace-host-0', terminal_id: `term${i}`, state_change_seq: i,
    })),
    tabs: ['idle', 'done', 'working', 'blocked'].map(status => ({ tab_id: status, label: status })),
  });
  await act(async () => { renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} />); });
  const chats = renderer.root.findAll(node => String(node.type) === 'Button' && String(node.props.accessibilityLabel).startsWith('Open chat '));
  expect(chats.map(chat => chat.find(node => String(node.type) === 'AgentStatusMedallion').props.status)).toEqual(['blocked', 'done', 'working', 'idle']);
});

test('only open Herdr conversations are listed, deduplicated by exact Codex ID, with terminal access for unlinked agents', async () => {
  const {sessions,onShowChats}=setup();
  Object.assign(sessions.presentationSessions[0].snapshot,{
    agents:[{agent:'claude',agent_status:'idle',pane_id:'claude-pane',tab_id:'claude-tab',workspace_id:'workspace-host-0'},{agent:'codex',agent_status:'working',pane_id:'wrong-pane',tab_id:'wrong-tab'}, codexAgent('exact-id'), codexAgent('exact-id', 'second-pane')],
    tabs:[{tab_id:'claude-tab',label:'Claude existing'},{tab_id:'wrong-tab',label:'Wrong inherited association'}],
  });
  const codexHosts=[{hostId:'host-0',sessionId:'session-host-0',name:'First',snapshot:{threads:[{id:'exact-id',name:'Codex exact',cwd:'/project',updatedAt:12,status:'working'}, {id:'closed-history',name:'Closed old history',cwd:'/project',updatedAt:15,status:'blocked'}],requests:[]}}];
  const openClaude=jest.fn(),openCodex=jest.fn();
  await act(async()=>{renderer=create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} onOpenChat={openClaude} onOpenCodex={openCodex} codexHosts={codexHosts as unknown as import('../src/hooks/useCodexHosts').CodexHost[]}/>);});
  const rows=renderer.root.findAll(n=>String(n.type)==='Button' && String(n.props.accessibilityLabel).startsWith('Open chat '));
  expect(rows).toHaveLength(2);
  expect(button('Open chat Closed old history on First')).toBeUndefined();
  act(() => { button('Open terminal codex on First').props.onPress(); });
  expect(sessions.openAgentTerminal).toHaveBeenCalledWith('session-host-0', expect.objectContaining({ pane_id: 'wrong-pane' }));
  act(()=>{ button('Open chat Codex exact on First').props.onPress(); });
  expect(openCodex).toHaveBeenCalledWith('host-0','exact-id');
  act(()=>{ button('Open chat claude on First').props.onPress(); });
  expect(openClaude).toHaveBeenCalledWith({hostId:'host-0',paneId:'claude-pane'});
});

test('startup keeps chats visible with neutral loading, hides stale errors and automatic connect rows', async () => {
  const { sessions, onShowChats } = setup();
  Object.assign(sessions, { restoreComplete: false });
  sessions.presentationSessions[0].connectionStatus = 'reconnecting';
  Object.assign(sessions.presentationSessions[0].snapshot, { tabs: [], agents: [codexAgent('exact')] });
  const codexHosts = [{ hostId: 'host-0', sessionId: 'session-host-0', name: 'First', snapshot: {
    connected: false, error: 'Old disconnect error', requests: [], threads: [{ id: 'exact', name: 'Existing chat', cwd: '/project', updatedAt: 1, status: 'idle' }],
  } }];
  await act(async () => { renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} codexHosts={codexHosts as unknown as import('../src/hooks/useCodexHosts').CodexHost[]} onManageHosts={jest.fn()} onShowChats={onShowChats} />); });
  expect(button('Open chat Existing chat on First')).toBeDefined();
  const scroll = renderer.root.findAllByType('ScrollView' as never).find(node => node.props.contentContainerStyle)!;
  expect(scroll.findAll(n => n.props.accessibilityRole === 'alert')).toHaveLength(0);
  expect(scroll.findAll(n => n.props.accessibilityLabel === 'Syncing chats')).toHaveLength(1);
  expect(scroll.findAll(n => n.children.includes('Connect'))).toHaveLength(0);
});

test('an acknowledged Codex completion displays idle and drops out of Needs you', async () => {
  const { sessions, onShowChats } = setup();
  Object.assign(sessions.presentationSessions[0].snapshot, { tabs: [], agents: [codexAgent('exact')] });
  const thread = { id: 'exact', name: 'Read chat', cwd: '/project', updatedAt: 12, status: 'done' as const };
  const { updateCodexActivity } = require('../src/lib/codexInbox');
  const library = { loaded: true, error: null, update: jest.fn(), value: updateCodexActivity(emptyChatLibrary, [{ hostId: 'host-0', threads: [thread] }]) };
  const codexHosts = [{ hostId: 'host-0', sessionId: 'session-host-0', name: 'First', snapshot: { connected: true, requests: [], threads: [thread] } }];
  await act(async () => { renderer = create(<ChatsScreen library={library} hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} codexHosts={codexHosts as unknown as import('../src/hooks/useCodexHosts').CodexHost[]} onManageHosts={jest.fn()} onShowChats={onShowChats} />); });
  expect(button('Open chat Read chat on First').findByType('AgentStatusMedallion' as never).props.status).toBe('idle');
  expect(button('Need you, 0')).toBeDefined();
  expect(button('Done, 0')).toBeDefined();
});

function codexAgent(id: string, pane = 'codex-pane') {
  return { agent: 'codex', agent_status: 'idle', pane_id: pane, terminal_id: `${pane}-terminal`, tab_id: 'codex-tab', workspace_id: 'workspace-host-0',
    agent_session: { agent: 'codex', source: 'herdr:codex', kind: 'id', value: id } };
}

test('the list follows Herdr closures and conversation changes without waiting for daemon history refresh', async () => {
  const { sessions, onShowChats } = setup();
  const snapshot = sessions.presentationSessions[0].snapshot;
  Object.assign(snapshot, { tabs: [], agents: [codexAgent('a')] });
  const codexHosts = [{ hostId: 'host-0', sessionId: 'session-host-0', snapshot: { connected: true, requests: [], threads: [
    { id: 'a', name: 'Thread A', cwd: '/same/project', updatedAt: 1, status: 'idle' },
    { id: 'b', name: 'Thread B', cwd: '/same/project', updatedAt: 2, status: 'idle' },
  ] } }];
  const props = { hosts, sessions: sessions as unknown as SessionRuntimeController, onManageHosts: jest.fn(), onShowChats,
    codexHosts: codexHosts as unknown as import('../src/hooks/useCodexHosts').CodexHost[] };
  await act(async () => { renderer = create(<ChatsScreen {...props} />); });
  expect(button('Open chat Thread A on First')).toBeDefined();
  expect(button('Open chat Thread B on First')).toBeUndefined();
  Object.assign(snapshot, { agents: [codexAgent('b')] });
  await act(async () => { renderer.update(<ChatsScreen {...props} />); });
  expect(button('Open chat Thread A on First')).toBeUndefined();
  expect(button('Open chat Thread B on First')).toBeDefined();
  Object.assign(snapshot, { agents: [] });
  await act(async () => { renderer.update(<ChatsScreen {...props} />); });
  expect(button('Open chat Thread B on First')).toBeUndefined();
});

test('a newly linked Herdr conversation opens its exact ID before daemon metadata arrives', async () => {
  const { sessions, onShowChats } = setup();
  Object.assign(sessions.presentationSessions[0].snapshot, { tabs: [], agents: [codexAgent('new-id')] });
  const open = jest.fn();
  await act(async () => { renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} onOpenCodex={open} codexHosts={[]} />); });
  act(() => { button('Open chat Codex on First').props.onPress(); });
  expect(open).toHaveBeenCalledWith('host-0', 'new-id');
});

test.each([false, true])('new Codex chat gets a Herdr tab and preserves the created thread after launch failure (%s)', async failure => {
  const { sessions, onShowChats } = setup();
  const createThread = jest.fn(async () => ({ id: 'created-id', name: 'New', cwd: '/home/test/Projects/mobile', updatedAt: 1, status: 'idle' }));
  if (failure) sessions.launchTab.mockRejectedValueOnce(new Error('Connection lost'));
  const open = jest.fn();
  const codexHosts = [{ hostId: 'host-0', sessionId: 'session-host-0', client: { create: createThread }, snapshot: { connected: true, threads: [], requests: [] } }];
  await act(async () => { renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} onOpenCodex={open} codexHosts={codexHosts as unknown as import('../src/hooks/useCodexHosts').CodexHost[]} />); });
  act(() => { button('New agent').props.onPress(); });
  act(() => { input('New project directory').props.onChangeText('/home/test/Projects/mobile'); });
  await act(async () => { await button('Start conversation').props.onPress(); });
  expect(sessions.createWorkspace).toHaveBeenCalledTimes(1);
  expect(createThread).toHaveBeenCalledTimes(1);
  expect(createThread).toHaveBeenCalledWith('/home/test/Projects/mobile', '', '', 'default');
  expect(sessions.launchTab).toHaveBeenCalledTimes(1);
  expect(sessions.launchTab).toHaveBeenCalledWith('session-host-0', 'new-workspace', 'Codex', {
    type: 'agent', kind: 'codex', args: ['resume', 'created-id'], reverseControl: false,
  }, 'background');
  expect(open).toHaveBeenCalledWith('host-0', 'created-id');
  expect(Alert.alert).toHaveBeenCalledTimes(failure ? 1 : 0);
  expect(onShowChats).not.toHaveBeenCalled();
});

test('a chat that is still opening shows progress on its own row', async () => {
  const { sessions, onShowChats } = setup();
  Object.assign(sessions.presentationSessions[0].snapshot, {
    agents: [{ agent: 'claude', agent_status: 'idle', pane_id: 'claude-pane', tab_id: 'claude-tab', workspace_id: 'workspace-host-0' }],
    tabs: [{ tab_id: 'claude-tab', label: 'Claude existing' }],
  });
  let finish!: () => void;
  const openClaude = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => { renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} onOpenChat={openClaude} />); });
  const row = () => button('Open chat claude on First');
  act(() => { row().props.onPress(); });
  expect(row().props.accessibilityState).toEqual({ busy: true });
  expect(row().props.accessibilityHint).toBe('Opening…');
  expect(row().findAll(node => String(node.type) === 'BusySpinner')).toHaveLength(1);
  await act(async () => { finish(); });
  expect(row().props.accessibilityState).toEqual({ busy: false });
  expect(row().findAll(node => String(node.type) === 'BusySpinner')).toHaveLength(0);
});

test('while servers reconnect with no chats yet, the queue shows placeholder rows', async () => {
  const { sessions, onShowChats } = setup();
  Object.assign(sessions, { restoreComplete: false });
  sessions.presentationSessions.forEach(session => { session.connectionStatus = 'reconnecting'; });
  await act(async () => { renderer = create(<ChatsScreen hosts={hosts} sessions={sessions as unknown as SessionRuntimeController} onManageHosts={jest.fn()} onShowChats={onShowChats} />); });
  expect(renderer.root.findAll(node => String(node.type) === 'ChatRowSkeleton')).toHaveLength(1);
});
