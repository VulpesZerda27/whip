import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  CodexChatScreen,
  PendingRequest,
} from '../src/components/CodexChatScreen';
import type {
  CodexDaemonClient,
  CodexRequest,
} from '../src/services/codexDaemon';
import type { HerdrClient } from '../src/services/HerdrClient';
import { composerDraftStorage } from '../src/services/composerDrafts';
jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  ActivityIndicator: 'Spinner',
  Platform: { OS: 'android' },
  Linking: { openURL: jest.fn(async () => {}) },
  Alert: { alert: jest.fn() },
}));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 30, bottom: 20 }),
}));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_target, name) => String(name) }),
);
jest.mock('../src/theme', () => ({
  useTheme: () => ({ colors: {} }),
  statusTint: (color: string) => color,
  nightfallShadows: {},
}));
jest.mock('../src/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('../src/components/ui/input', () => ({ Input: 'Input' }));
jest.mock('../src/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('../src/components/app-ui', () => ({ PulsingDot: 'PulsingDot' }));
jest.mock('../src/components/ChatSessionActions', () => ({ ChatHeader: 'ChatHeader', HeaderPill: 'HeaderPill' }));
jest.mock('../src/components/nightfall', () => ({ BottomSheet: 'BottomSheet', BusySpinner: 'BusySpinner' }));
jest.mock('../src/components/AgentChatView', () => ({
  AgentChatView: 'AgentChatView',
}));
jest.mock('../src/components/MessageComposer', () => ({
  MessageComposer: 'Composer',
}));
jest.mock('../src/services/attachmentPaste', () => ({}));
jest.mock('../src/hooks/useKeyboardInset', () => ({
  useKeyboardInset: () => ({ inset: 0 }),
}));
jest.mock('../src/services/chatSpeech', () => ({
  listenToChat: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/composerDrafts', () => ({
  composerDraftStorage: {
    load: jest.fn(async () => ({})),
    save: jest.fn(async () => {}),
  },
}));
let renderer: ReactTestRenderer;
afterEach(() => {
  act(() => renderer.unmount());
  jest.clearAllMocks();
});
const daemon = () => {
  const backend = {
    snapshot: {
      connected: true,
      threads: [
        {
          id: 'exact',
          name: 'Exact chat',
          cwd: '/srv/project',
          status: 'idle',
        },
      ],
      chats: {},
      requests: [],
      revision: 1,
    },
    subscribe: () => () => {},
    getSnapshot: () => backend.snapshot,
    open: jest.fn(async () => {}),
    isOpen: () => true,
    send: jest.fn(async () => {}),
    respond: jest.fn(async () => {}),
  };
  return backend;
};
const buttons = () => renderer.root.findAll(n => String(n.type) === 'Button');
test('a failed send retains the draft, uses the exact thread, and file taps carry its directory', async () => {
  const backend = daemon();
  backend.send.mockRejectedValueOnce(new Error('Delivery unknown'));
  const openFile = jest.fn();
  await act(async () => {
    renderer = create(
      <CodexChatScreen
        hostId="host"
        threadId="exact"
        hostName="Server"
        daemon={backend as unknown as CodexDaemonClient}
        client={{} as HerdrClient}
        onOpenFile={openFile}
        onTerminal={jest.fn()}
        onConsumeDraft={jest.fn()}
      />,
    );
  });
  const composer = () => renderer.root.find(n => String(n.type) === 'Composer');
  act(() => {
    composer().props.onChangeText('Keep this message');
  });
  await act(async () => {
    composer().props.actions.onSend();
  });
  expect(backend.send).toHaveBeenCalledWith(
    'exact',
    'Keep this message',
    [],
    '',
    'default',
  );
  expect(composer().props.initialValue).toBe('Keep this message');
  expect(composerDraftStorage.save).not.toHaveBeenCalledWith(
    'host',
    'codex-thread:exact',
    '',
  );
  const chat = renderer.root.find(n => String(n.type) === 'AgentChatView');
  act(() => {
    chat.props.onOpenFile({ path: '/srv/project/image.png' });
  });
  expect(openFile).toHaveBeenCalledWith(
    { path: '/srv/project/image.png' },
    '/srv/project',
  );
  expect(chat.props.simpleChat).toBe(true);
});
test('approval taps respond to the original daemon request without typing into a terminal', async () => {
  const backend = daemon();
  const request: CodexRequest = {
    id: 42,
    connectionId: 'connection',
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: 'exact',
      command: 'command',
      availableDecisions: ['accept', 'decline', 'cancel'],
    },
  };
  await act(async () => {
    renderer = create(
      <PendingRequest
        daemon={backend as unknown as CodexDaemonClient}
        request={request}
      />,
    );
  });
  const deny = buttons().find(b =>
    b
      .findAll(n => String(n.type) === 'Text')
      .some(n => n.props.children === 'Deny'),
  )!;
  await act(async () => {
    deny.props.onPress();
  });
  expect(backend.respond).toHaveBeenCalledWith(request, {
    decision: 'decline',
  });
});
test('multiple agent questions return separate keyed answers', async () => {
  const backend = daemon();
  const request: CodexRequest = {
    id: 'q',
    connectionId: 'c',
    method: 'item/tool/requestUserInput',
    params: {
      threadId: 'exact',
      questions: [
        { id: 'a', question: 'First?' },
        { id: 'b', question: 'Second?' },
      ],
    },
  };
  await act(async () => {
    renderer = create(
      <PendingRequest
        daemon={backend as unknown as CodexDaemonClient}
        request={request}
      />,
    );
  });
  const inputs = renderer.root.findAll(n => String(n.type) === 'Input');
  act(() => {
    inputs[0].props.onChangeText('one');
    inputs[1].props.onChangeText('two');
  });
  await act(async () => {
    buttons()[0].props.onPress();
  });
  expect(backend.respond).toHaveBeenCalledWith(request, {
    answers: { a: { answers: ['one'] }, b: { answers: ['two'] } },
  });
});
test('the Nightfall header names the thread, offers Remote files at its directory and goes back to Chats', async () => {
  const backend = daemon();
  const openFile = jest.fn();
  const back = jest.fn();
  await act(async () => {
    renderer = create(
      <CodexChatScreen
        hostId="host"
        threadId="exact"
        hostName="Server"
        daemon={backend as unknown as CodexDaemonClient}
        client={{} as HerdrClient}
        onOpenFile={openFile}
        onTerminal={jest.fn()}
        onConsumeDraft={jest.fn()}
        onBack={back}
      />,
    );
  });
  const header = renderer.root.find(n => String(n.type) === 'ChatHeader');
  expect(header.props).toEqual(expect.objectContaining({ title: 'Exact chat', subtitle: 'codex · Server', path: '/srv/project', status: 'idle' }));
  header.props.onBack();
  expect(back).toHaveBeenCalledTimes(1);
  const files = header.props.options.find((option: { label: string }) => option.label === 'Remote files');
  act(() => { files.onPress(); });
  expect(openFile).toHaveBeenCalledWith(undefined, '/srv/project');
});

test('a sent prompt appears at once, frees the composer, and yields to the transcript echo', async () => {
  const backend = daemon();
  const listeners = new Set<() => void>();
  backend.subscribe = ((listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); }) as never;
  let deliver!: () => void;
  backend.send.mockImplementationOnce(() => new Promise<void>(resolve => { deliver = resolve; }));
  await act(async () => {
    renderer = create(
      <CodexChatScreen
        hostId="host"
        threadId="exact"
        hostName="Server"
        daemon={backend as unknown as CodexDaemonClient}
        client={{} as HerdrClient}
        onOpenFile={jest.fn()}
        onTerminal={jest.fn()}
        onConsumeDraft={jest.fn()}
      />,
    );
  });
  const composer = () => renderer.root.find(n => String(n.type) === 'Composer');
  const chat = () => renderer.root.find(n => String(n.type) === 'AgentChatView');
  act(() => { composer().props.onChangeText('Ship it'); });
  await act(async () => { composer().props.actions.onSend(); });
  expect(composer().props.initialValue).toBe('');
  expect(composer().props.editable).toBeUndefined();
  expect(chat().props.pendingPrompts).toEqual([
    expect.objectContaining({ text: 'Ship it', state: 'sending', baseline: 0 }),
  ]);
  expect(composerDraftStorage.save).not.toHaveBeenCalledWith('host', 'codex-thread:exact', '');
  await act(async () => { deliver(); });
  expect(chat().props.pendingPrompts).toEqual([
    expect.objectContaining({ text: 'Ship it', state: 'sent' }),
  ]);
  expect(composerDraftStorage.save).toHaveBeenCalledWith('host', 'codex-thread:exact', '');
  const user = { id: 'u', role: 'user', parts: [{ type: 'text', id: 'u', text: 'Ship it' }], diffs: [] };
  await act(async () => {
    backend.snapshot = {
      ...backend.snapshot,
      chats: { exact: { sessionId: 'exact', status: 'live', transcript: { sessionId: 'exact', messages: [user], turns: [{ id: 't', user, assistants: [], status: 'working', diffs: [] }] } } },
    };
    listeners.forEach(listener => listener());
  });
  expect(chat().props.pendingPrompts).toEqual([]);
});

test('a failed send withdraws its bubble and returns the message to the composer', async () => {
  const backend = daemon();
  backend.send.mockRejectedValueOnce(new Error('Delivery unknown'));
  await act(async () => {
    renderer = create(
      <CodexChatScreen
        hostId="host"
        threadId="exact"
        hostName="Server"
        daemon={backend as unknown as CodexDaemonClient}
        client={{} as HerdrClient}
        onOpenFile={jest.fn()}
        onTerminal={jest.fn()}
        onConsumeDraft={jest.fn()}
      />,
    );
  });
  const composer = () => renderer.root.find(n => String(n.type) === 'Composer');
  act(() => { composer().props.onChangeText('Try again later'); });
  await act(async () => { composer().props.actions.onSend(); });
  expect(composer().props.initialValue).toBe('Try again later');
  expect(renderer.root.find(n => String(n.type) === 'AgentChatView').props.pendingPrompts).toEqual([]);
});
