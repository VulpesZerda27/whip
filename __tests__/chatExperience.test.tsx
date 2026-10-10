import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useChatExperience } from '../src/hooks/useChatExperience';
import type { ChatLibraryController } from '../src/hooks/useChatLibrary';
import type { SessionRuntimeController } from '../src/hooks/useSessionRuntimeManager';
import type { AppNavigationController } from '../src/hooks/useAppNavigation';
import { emptyChatLibrary, chatKey } from '../src/services/chatLibrary';
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
const recent = { hostId: 'server-b', paneId: 'pane-b', label: 'Website' };

function setup(resume = true) {
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
      lastChat: recent,
      resumeOnLaunch: resume,
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

test('startup resumes the exact remembered server and pane in chat mode', () => {
  const { Harness, sessions, navigation, agent } = setup();
  act(() => {
    renderer = create(<Harness />);
  });
  expect(sessions.openPaneTerminal).toHaveBeenCalledWith(
    'session-b',
    agent,
    true,
  );
  expect(navigation.showChat).toHaveBeenCalledTimes(1);
});
test('resume preference can disable automatic reopening', () => {
  const { Harness, sessions } = setup(false);
  act(() => {
    renderer = create(<Harness />);
  });
  expect(sessions.openPaneTerminal).not.toHaveBeenCalled();
});
test('resuming an offline conversation reconnects its server before opening it', async () => {
  const { Harness, sessions, session, navigation } = setup(false);
  session.connectionStatus = 'error';
  act(() => {
    renderer = create(<Harness />);
  });
  await act(async () => {
    await controller.open(recent);
  });
  expect(sessions.connectSavedHost).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'server-b' }),
    { navigate: false },
  );
  expect(navigation.showChat).toHaveBeenCalledTimes(1);
});
test('a slow reconnect cannot hijack navigation or open a second chat', async () => {
  const { Harness, sessions, session, navigation } = setup(false);
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
    pending = controller.open(recent);
    await controller.open(recent);
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
  const { Harness, library, navigation, agent } = setup(false);
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
