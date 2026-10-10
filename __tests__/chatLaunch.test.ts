import { chatLaunchIntent } from '../src/lib/chatLaunch';
import {
  loadChatLaunchPreferences,
  saveChatLaunchPreferences,
} from '../src/services/chatLaunchPreferences';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

beforeEach(() => jest.clearAllMocks());

test('Codex uses automatic review with an explicit sandbox, including when the server default is full access', () => {
  expect(
    chatLaunchIntent({ provider: 'codex', model: '', effort: 'default' }),
  ).toEqual({
    type: 'agent',
    kind: 'codex',
    reverseControl: false,
    args: [
      '--ask-for-approval',
      'on-request',
      '--sandbox',
      'workspace-write',
      '-c',
      'approvals_reviewer="auto_review"',
    ],
  });
});

test('Claude starts in Auto mode and preserves a selected model and effort', () => {
  expect(
    chatLaunchIntent({ provider: 'claude', model: ' sonnet ', effort: 'high' }),
  ).toMatchObject({
    kind: 'claude',
    args: [
      '--permission-mode',
      'auto',
      '--model',
      'sonnet',
      '--effort',
      'high',
    ],
  });
});

test('model input stays one structured argument, never command text', () => {
  const model = "model'; touch /tmp/not-a-command; #";
  expect(
    chatLaunchIntent({ provider: 'codex', model, effort: 'xhigh' }),
  ).toMatchObject({
    args: expect.arrayContaining([
      '--model',
      model,
      'model_reasoning_effort="xhigh"',
    ]),
  });
  expect(() =>
    chatLaunchIntent({ provider: 'codex', model: 'a\nb', effort: 'default' }),
  ).toThrow('control characters');
});

test('effort settings cannot inject extra Codex configuration and Claude excludes ultra', () => {
  expect(() =>
    chatLaunchIntent({ provider: 'claude', model: '', effort: 'ultra' }),
  ).toThrow('Unsupported');
  expect(() =>
    chatLaunchIntent({
      provider: 'codex',
      model: '',
      effort: 'invalid' as 'high',
    }),
  ).toThrow('Unsupported');
});

test('each provider keeps independent defaults across app restarts', async () => {
  const saved = {
    provider: 'claude' as const,
    hostId: 'server-two',
    providers: {
      codex: { model: 'custom-codex', effort: 'xhigh' as const },
      claude: { model: 'opus', effort: 'low' as const },
    },
  };
  await saveChatLaunchPreferences(saved);
  const serialized = jest.mocked(AsyncStorage.setItem).mock.calls[0][1];
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(serialized);
  await expect(loadChatLaunchPreferences()).resolves.toEqual(saved);
});

test('invalid stored preferences fall back to supported settings', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
    JSON.stringify({
      provider: 'shell',
      hostId: 12,
      providers: { claude: { effort: 'ultra', model: null } },
    }),
  );
  await expect(loadChatLaunchPreferences()).resolves.toMatchObject({
    provider: 'codex',
    hostId: '',
    providers: { claude: { model: '', effort: 'default' } },
  });
});
