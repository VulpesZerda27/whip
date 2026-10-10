import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useChatExperience } from '../src/hooks/useChatExperience';
import type { ChatLibraryController } from '../src/hooks/useChatLibrary';
import type { SessionRuntimeController } from '../src/hooks/useSessionRuntimeManager';
import type { AppNavigationController } from '../src/hooks/useAppNavigation';
import { emptyChatLibrary, chatKey, parseChatLibrary } from '../src/services/chatLibrary';
import { chatFingerprint } from '../src/lib/chatInbox';
import { AppState } from 'react-native';

jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
const mockListeners = new Set<(state: string) => void>();
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((_event, listener) => {
      mockListeners.add(listener);
      return { remove: () => mockListeners.delete(listener) };
    }),
  },
}));
let renderer: ReactTestRenderer;
let controller: ReturnType<typeof useChatExperience>;
const target = { hostId: 'server-b', paneId: 'pane-b' };

function setup() {
  const agent = {
    pane_id: 'pane-b',
    terminal_id: 'terminal-b',
    workspace_id: 'w',
    tab_id: 'tab',
    agent: 'claude',
    agent_status: 'done',
    state_change_seq: 4,
  };
  const snapshot = {
    agents: [agent],
    panes: [agent],
    workspaces: [],
    tabs: [{ tab_id: 'tab', label: 'Website' }],
  };
  const session = {
    id: 'session-b',
    hostId: 'server-b',
    connectionStatus: 'ready',
    snapshot,
    hostState: { snapshot },
  };
  const sessions = {
    presentationSessions: [session],
    activeSession: session,
    restoreComplete: true,
    getState: () => ({ sessions: [session] }),
    openPaneTerminal: jest.fn(),
    connectSavedHost: jest.fn(async () => {
      session.connectionStatus = 'ready';
    }),
    startServer: jest.fn(),
  };
  const library: ChatLibraryController = {
    value: {
      ...emptyChatLibrary,
      activity: {},
    },
    loaded: true,
    error: null,
    update: change => {
      library.value = change(library.value);
    },
  };
  const navigation = {
    state: { tab: 'chats', lastNonTerminalTab: 'chats' },
    showChat: jest.fn(),
    selectTab: jest.fn(),
  };
  function Harness() {
    controller = useChatExperience(
      library,
      sessions as unknown as SessionRuntimeController,
      navigation as unknown as AppNavigationController,
      [{ id: 'server-b', name: 'Second server' }] as never,
      'pane-b',
      true,
    );
    return null;
  }
  return { sessions, session, agent, library, navigation, Harness };
}
beforeEach(() => {
  AppState.currentState = 'active';
});
afterEach(() => {
  act(() => renderer?.unmount());
  mockListeners.clear();
});

test('legacy auto-resume settings never open a conversation during startup or foregrounding', () => {
  AppState.currentState = 'background';
  const { Harness, sessions, library, navigation } = setup();
  library.value = parseChatLibrary(JSON.stringify({
    ...emptyChatLibrary,
    lastChat: { ...target, label: 'Website' },
    resumeOnLaunch: true,
  }));
  sessions.restoreComplete = false;
  act(() => { renderer = create(<Harness />); });
  sessions.restoreComplete = true;
  act(() => { renderer.update(<Harness />); });
  act(() => {
    for (const listener of mockListeners) listener('active');
  });
  expect(sessions.openPaneTerminal).not.toHaveBeenCalled();
  expect(sessions.connectSavedHost).not.toHaveBeenCalled();
  expect(navigation.showChat).not.toHaveBeenCalled();
});
test('selecting a chat still opens its exact server and pane', async () => {
  const { Harness, sessions, navigation, agent } = setup();
  act(() => { renderer = create(<Harness />); });
  await act(async () => { await controller.open(target); });
  expect(sessions.openPaneTerminal).toHaveBeenCalledWith('session-b', agent, true);
  expect(navigation.showChat).toHaveBeenCalledTimes(1);
});
test('selecting an offline conversation reconnects its server before opening it', async () => {
  const { Harness, sessions, session, navigation } = setup();
  session.connectionStatus = 'error';
  act(() => {
    renderer = create(<Harness />);
  });
  await act(async () => {
    await controller.open(target);
  });
  expect(sessions.connectSavedHost).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'server-b' }),
    { navigate: false },
  );
  expect(navigation.showChat).toHaveBeenCalledTimes(1);
});
test('a slow reconnect cannot hijack navigation or open a second chat', async () => {
  const { Harness, sessions, session, navigation } = setup();
  session.connectionStatus = 'error';
  let finish!: () => void;
  sessions.connectSavedHost.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = () => {
          session.connectionStatus = 'ready';
          resolve();
        };
      }),
  );
  act(() => {
    renderer = create(<Harness />);
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.open(target);
    await controller.open(target);
  });
  expect(sessions.connectSavedHost).toHaveBeenCalledTimes(1);
  navigation.state = { tab: 'hosts', lastNonTerminalTab: 'hosts' };
  act(() => {
    renderer.update(<Harness />);
  });
  await act(async () => {
    finish();
    await pending;
  });
  expect(sessions.openPaneTerminal).not.toHaveBeenCalled();
});
test('responses arriving while the phone is locked remain unread until returning to chat', () => {
  AppState.currentState = 'background';
  const { Harness, library, navigation, agent } = setup();
  navigation.state = { tab: 'terminal', lastNonTerminalTab: 'chats' };
  act(() => {
    renderer = create(<Harness />);
  });
  expect(library.value.activity[chatKey('server-b', 'pane-b')].seen).toBe('');
  act(() => {
    for (const listener of mockListeners) listener('active');
  });
  expect(library.value.activity[chatKey('server-b', 'pane-b')].seen).toBe(
    chatFingerprint(agent as never),
  );
});
