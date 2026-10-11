import {
  updateCodexActivity,
  codexNeedsAttention,
} from '../src/lib/codexInbox';
import { elicitationContent } from '../src/lib/codexElicitation';
import { emptyChatLibrary, chatKey } from '../src/services/chatLibrary';
import { codexChatKey, type CodexThread } from '../src/services/codexDaemon';
jest.mock('@react-native-async-storage/async-storage', () => ({}));
const thread: CodexThread = {
  id: 'same-id',
  name: 'Chat',
  cwd: '/project',
  updatedAt: 12,
  status: 'idle',
};
const key = chatKey('a', codexChatKey(thread.id));
test('old history is a baseline; new completions are unread until their exact host/thread is selected', () => {
  let state = updateCodexActivity(emptyChatLibrary, [
    { hostId: 'a', threads: [thread] },
  ]);
  expect(codexNeedsAttention(thread, false, state.activity[key])).toBe(false);
  const completed = { ...thread, status: 'done' as const, updatedAt: 14 };
  state = updateCodexActivity(state, [{ hostId: 'a', threads: [completed] }], {
    hostId: 'b',
    threadId: thread.id,
  });
  expect(codexNeedsAttention(completed, false, state.activity[key])).toBe(true);
  state = updateCodexActivity(state, [{ hostId: 'a', threads: [completed] }], {
    hostId: 'a',
    threadId: thread.id,
  });
  expect(codexNeedsAttention(completed, false, state.activity[key])).toBe(
    false,
  );
  expect(codexNeedsAttention(completed, true, state.activity[key])).toBe(true);
  expect(
    updateCodexActivity(state, [{ hostId: 'a', threads: [completed] }]),
  ).toBe(state);
});
test('elicitation preserves typed values and rejects missing or out-of-range answers', () => {
  const schema = {
    properties: {
      ok: { type: 'boolean' },
      count: { type: 'integer', minimum: 1 },
      name: { type: 'string', enum: ['A', 'B'] },
      options: { type: 'array', items: { enum: ['a', 'b'] } },
    },
    required: ['ok', 'count'],
  };
  expect(
    elicitationContent(schema, {
      ok: 'false',
      count: '2',
      name: 'B',
      options: '["a"]',
    }),
  ).toEqual({ ok: false, count: 2, name: 'B', options: ['a'] });
  expect(() => elicitationContent(schema, { ok: 'true' })).toThrow('count');
  expect(() => elicitationContent(schema, { ok: 'true', count: '0' })).toThrow(
    'count',
  );
  expect(() =>
    elicitationContent(schema, { ok: 'true', count: '1', name: 'missing' }),
  ).toThrow('name');
});

test('Herdr receipts require an exact integration-owned ID and never infer identity from cwd, title, or focus', () => {
  const { herdrCodexReceipts } = require('../src/lib/codexInbox');
  const agent = { agent: 'codex', agent_status: 'idle', pane_id: 'p', state_change_seq: 4, cwd: '/project', focused: true,
    agent_session: { agent: 'codex', source: 'herdr:codex', kind: 'id', value: 'a' } };
  expect([...herdrCodexReceipts([agent]).keys()]).toEqual(['a']);
  for (const changes of [{ agent_session: undefined }, { agent_status: 'done' }, { agent_status: 'working' }, { launch_pending: true }, { agent_session: { ...agent.agent_session, kind: 'path' } }]) {
    expect(herdrCodexReceipts([{ ...agent, ...changes }]).size).toBe(0);
  }
  expect(herdrCodexReceipts([agent, { ...agent, pane_id: 'other', agent_status: 'working' }]).size).toBe(0);
});
