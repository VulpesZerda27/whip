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
jest.mock('../src/theme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('../src/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('../src/components/ui/input', () => ({ Input: 'Input' }));
jest.mock('../src/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('../src/components/app-ui', () => ({ StatusBadge: 'StatusBadge' }));
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
  const native = {};
  const sessions = {
    getClient: jest.fn(() => ({ native })),
    presentationSessions: hosts.map(host => ({
      id: `session-${host.id}`,
      hostId: host.id,
      host,
      connectionStatus: 'ready',
      snapshot: {
        agents: [],
        workspaces: [
          { workspace_id: `workspace-${host.id}`, label: host.name },
        ],
      },
    })),
    connectingHostIds: new Set(),
    launchTab: jest.fn(async (): Promise<void> => {}),
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
  expect(sessions.launchTab).toHaveBeenCalledWith('session-host-1', 'new-workspace', 'Website', expect.objectContaining({ kind: 'claude', args: expect.arrayContaining(['--effort', 'high']) }));
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
  expect(chats.map(chat => chat.find(node => String(node.type) === 'StatusBadge').props.status)).toEqual(['blocked', 'done', 'working', 'idle']);
});
