import AsyncStorage from '@react-native-async-storage/async-storage';
import { ComposerDraftStorage } from '../src/services/composerDrafts';
import {
  parseChatLibrary,
  emptyChatLibrary,
  chatKey,
} from '../src/services/chatLibrary';
import { chatFingerprint, chatNeedsAttention } from '../src/lib/chatInbox';
import type { AgentInfo } from '../src/types';

const mockDisk = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockDisk.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockDisk.set(key, value);
  }),
}));
beforeEach(() => {
  mockDisk.clear();
  jest.clearAllMocks();
});

test('drafts survive a process restart and stay isolated by server and terminal', async () => {
  const first = new ComposerDraftStorage();
  await first.save('server-a', 'pane-1', 'A dictated message');
  await first.save('server-b', 'pane-1', 'A different project');
  const restarted = new ComposerDraftStorage();
  expect((await restarted.load('server-a'))['pane-1'].text).toBe(
    'A dictated message',
  );
  expect((await restarted.load('server-b'))['pane-1'].text).toBe(
    'A different project',
  );
});

test('a delayed write cannot resurrect a draft after it is sent or cleared', async () => {
  let finish!: () => void;
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(
    (key, value) =>
      new Promise(resolve => {
        finish = () => {
          mockDisk.set(key, value);
          resolve();
        };
      }),
  );
  const drafts = new ComposerDraftStorage();
  const old = drafts.save('a', '1', 'old');
  const cleared = drafts.save('a', '1', '');
  for (let turn = 0; turn < 10 && !finish; turn++) await Promise.resolve();
  finish();
  await Promise.all([old, cleared]);
  expect(await new ComposerDraftStorage().load('a')).toEqual({});
});

test('legacy resume settings are discarded while favorites and activity survive', () => {
  const favorite = {
    id: '1',
    label: 'Project',
    hostId: 'a',
    directory: '/srv/project',
    workspaceId: 'w',
    provider: 'claude',
    model: 'sonnet',
    effort: 'high',
  };
  const parsed = parseChatLibrary(
    JSON.stringify({
      ...emptyChatLibrary,
      favorites: [favorite, { ...favorite, provider: 'unknown' }],
      lastChat: { hostId: 'a', paneId: 'pane', label: 'Old conversation' },
      resumeOnLaunch: true,
      activity: { chat: { fingerprint: 'done', seen: '', updatedAt: 1 } },
    }),
  );
  expect(parsed.favorites).toEqual([favorite]);
  expect(parsed).not.toHaveProperty('resumeOnLaunch');
  expect(parsed).not.toHaveProperty('lastChat');
  expect(parsed.activity.chat).toEqual({ fingerprint: 'done', seen: '', updatedAt: 1 });
  expect(chatKey('a:b', 'c')).not.toBe(chatKey('a', 'b:c'));
});

test('seen completions clear, new completions become unread, and blocked agents always need attention', () => {
  const agent = {
    agent: 'codex',
    agent_status: 'done',
    state_change_seq: 2,
  } as AgentInfo;
  const activity = {
    fingerprint: chatFingerprint(agent),
    seen: chatFingerprint(agent),
    updatedAt: 1,
  };
  expect(chatNeedsAttention(agent, activity)).toBe(false);
  expect(chatNeedsAttention({ ...agent, state_change_seq: 3 }, activity)).toBe(
    true,
  );
  expect(
    chatNeedsAttention({ ...agent, agent_status: 'blocked' }, activity),
  ).toBe(true);
  expect(
    chatNeedsAttention({ ...agent, agent_status: 'working' }, activity),
  ).toBe(false);
});
