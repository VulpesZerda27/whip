import {
  CodexDaemonClient,
  projectCodex,
  codexStatus,
  type CodexRecord,
  type CodexEvent,
  type CodexWire,
} from '../src/services/codexDaemon';
const thread: CodexRecord = {
  id: 'thread-a',
  cwd: '/same/project',
  name: 'A',
  updatedAt: 12,
  status: { type: 'idle' },
};
const turn = {
  id: 'turn-a',
  status: 'completed',
  itemsView: 'full',
  items: [
    {
      id: 'user-a',
      type: 'userMessage',
      content: [{ type: 'text', text: 'Hi' }],
    },
    { id: 'answer-a', type: 'agentMessage', text: 'The entire final answer.' },
  ],
};
function fixture() {
  let connectionId = 'one';
  let events: CodexEvent[] = [];
  const calls: { operation: string; payload: CodexWire }[] = [];
  const native = {
    codexCall: jest.fn(async (operation: string, raw: string) => {
      const payload = JSON.parse(raw) as CodexWire;
      calls.push({ operation, payload });
      if (operation === 'events') {
        const packet = { connectionId, events, requests: [] };
        events = [];
        return JSON.stringify(packet);
      }
      if (operation === 'respond') return 'null';
      const params = payload.params as CodexWire;
      let result: unknown = {};
      if (payload.method === 'thread/list')
        result = { data: [thread, { ...thread, id: 'thread-b', name: 'B' }] };
      if (payload.method === 'thread/resume')
        result = {
          thread: {
            ...thread,
            id: params.threadId,
            turns: [structuredClone(turn)],
          },
        };
      if (payload.method === 'thread/start')
        result = { thread: { ...thread, id: 'new-thread', turns: [] } };
      return JSON.stringify({ connectionId, result, eventCursor: 10 });
    }),
  };
  return {
    native,
    calls,
    client: new CodexDaemonClient(native),
    reconnect: () => {
      connectionId = 'two';
    },
    queue: (event: CodexEvent) => events.push(event),
  };
}

test('discovery lists exact thread IDs without resuming or relying on identical project directories', async () => {
  const f = fixture();
  await f.client.refresh();
  expect(f.client.snapshot.threads.map(t => t.id)).toEqual([
    'thread-a',
    'thread-b',
  ]);
  expect(f.calls.every(c => c.payload.method === 'thread/list')).toBe(true);
});
test('opening uses the chosen ID and preserves the complete final answer', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-b');
  expect(
    f.calls.find(c => c.payload.method === 'thread/resume')?.payload.params,
  ).toEqual({ threadId: 'thread-b' });
  expect(
    f.client.snapshot.chats['thread-b'].transcript.messages.at(-1)?.parts,
  ).toContainEqual({
    type: 'text',
    id: 'answer-a',
    text: 'The entire final answer.',
  });
  expect(f.client.snapshot.chats['thread-a']).toBeUndefined();
});
test('snapshot boundary discards already included deltas, then completed items replace streamed content', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  f.client.event({
    _whipSeq: 9,
    method: 'item/agentMessage/delta',
    params: {
      threadId: 'thread-a',
      turnId: 'turn-a',
      itemId: 'answer-a',
      delta: 'duplicate',
    },
  });
  f.client.event({
    _whipSeq: 11,
    method: 'item/agentMessage/delta',
    params: {
      threadId: 'thread-a',
      turnId: 'turn-a',
      itemId: 'answer-a',
      delta: ' More.',
    },
  });
  expect(
    f.client.snapshot.chats['thread-a'].transcript.messages.at(-1)?.parts,
  ).toContainEqual({
    type: 'text',
    id: 'answer-a',
    text: 'The entire final answer. More.',
  });
  f.client.event({
    _whipSeq: 12,
    method: 'item/completed',
    params: {
      threadId: 'thread-a',
      turnId: 'turn-a',
      item: {
        id: 'answer-a',
        type: 'agentMessage',
        text: 'Authoritative final.',
      },
    },
  });
  expect(
    f.client.snapshot.chats['thread-a'].transcript.messages.at(-1)?.parts,
  ).toContainEqual({
    type: 'text',
    id: 'answer-a',
    text: 'Authoritative final.',
  });
});
test('a dropped acknowledgement is not replayed and includes the connection identity', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  f.native.codexCall.mockRejectedValueOnce(new Error('connection lost'));
  await expect(f.client.send('thread-a', 'Test', [])).rejects.toThrow(
    'connection lost',
  );
  expect(
    f.native.codexCall.mock.calls.filter(
      ([op, raw]) =>
        op === 'request' && JSON.parse(raw).method === 'turn/start',
    ),
  ).toHaveLength(1);
  expect(
    JSON.parse(f.native.codexCall.mock.calls.at(-1)![1]).expectedConnectionId,
  ).toBe('one');
});
test('an active turn receives steer with its exact ID, and interruption targets that turn', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  f.client.event({
    method: 'turn/started',
    params: {
      threadId: 'thread-a',
      turn: { id: 'running', items: [], status: 'inProgress' },
    },
  });
  await f.client.send('thread-a', 'Guidance', []);
  await f.client.interrupt('thread-a');
  expect(
    f.calls.find(c => c.payload.method === 'turn/steer')?.payload.params,
  ).toMatchObject({ threadId: 'thread-a', expectedTurnId: 'running' });
  expect(
    f.calls.find(c => c.payload.method === 'turn/interrupt')?.payload.params,
  ).toEqual({ threadId: 'thread-a', turnId: 'running' });
});
test('new chats use auto review and chosen model/effort, without creating a terminal', async () => {
  const f = fixture();
  await f.client.create('/project', 'New', 'model-a', 'high');
  expect(
    f.calls.find(c => c.payload.method === 'thread/start')?.payload.params,
  ).toMatchObject({
    cwd: '/project',
    model: 'model-a',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    sandbox: 'workspace-write',
    config: { model_reasoning_effort: 'high' },
  });
});
test('connection replacement invalidates open chat and pending approval state', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  expect(f.client.isOpen('thread-a')).toBe(true);
  f.reconnect();
  await f.client.refresh();
  expect(f.client.isOpen('thread-a')).toBe(false);
  await expect(f.client.send('thread-a', 'Do not send', [])).rejects.toThrow(
    'reconnect',
  );
});
test('approval responses carry the original connection and request identity', async () => {
  const f = fixture();
  await f.client.respond(
    {
      id: 7,
      connectionId: 'old',
      method: 'item/fileChange/requestApproval',
      params: { threadId: 'thread-a' },
    },
    { decision: 'decline' },
  );
  expect(f.calls.at(-1)).toEqual({
    operation: 'respond',
    payload: { connectionId: 'old', id: 7, result: { decision: 'decline' } },
  });
});
test('projection keeps images, reasoning, tool failures, and failed turns visible', () => {
  const state = projectCodex(thread, [
    {
      id: 't',
      status: 'failed',
      error: { message: 'Turn failed' },
      items: [
        {
          id: 'u',
          type: 'userMessage',
          content: [{ type: 'localImage', path: '/project/image.png' }],
        },
        { id: 'r', type: 'reasoning', summary: ['Reasoning'] },
        {
          id: 'c',
          type: 'commandExecution',
          status: 'failed',
          command: 'test',
          exitCode: 1,
          aggregatedOutput: 'Failure output',
        },
      ],
    },
  ]);
  expect(state.transcript.messages.flatMap(m => m.parts)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'image', source: '/project/image.png' }),
      expect.objectContaining({ type: 'reasoning', text: 'Reasoning' }),
      expect.objectContaining({ type: 'notice', text: 'Turn failed' }),
      expect.objectContaining({
        type: 'tool',
        state: expect.objectContaining({
          status: 'error',
          output: 'Failure output',
          exitCode: 1,
        }),
      }),
    ]),
  );
  expect(
    codexStatus({
      ...thread,
      status: { type: 'active', activeFlags: ['waitingOnApproval'] },
    }),
  ).toBe('blocked');
});

test('completion state is tracked even when the conversation was never opened', async () => {
  const f = fixture();
  await f.client.refresh();
  f.client.event({
    method: 'thread/status/changed',
    params: {
      threadId: 'thread-b',
      status: { type: 'active', activeFlags: [] },
    },
  });
  expect(f.client.snapshot.threads.find(t => t.id === 'thread-b')?.status).toBe(
    'working',
  );
  f.client.event({
    method: 'thread/status/changed',
    params: { threadId: 'thread-b', status: { type: 'idle' } },
  });
  expect(f.client.snapshot.threads.find(t => t.id === 'thread-b')?.status).toBe(
    'done',
  );
  expect(f.client.snapshot.chats['thread-b']).toBeUndefined();
});

test('native wakeups deliver events when JS timers have not fired, without empty-poll rerenders', async () => {
  const f = fixture();
  const listeners = new Set<() => void>();
  const client = new CodexDaemonClient({
    ...f.native,
    subscribeCodexActivity: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  const changed = jest.fn();
  client.subscribe(changed);
  client.start();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const count = changed.mock.calls.length;
  for (const listener of listeners) listener();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(changed).toHaveBeenCalledTimes(count);
  f.queue({
    method: 'thread/status/changed',
    params: {
      threadId: 'thread-b',
      status: { type: 'active', activeFlags: ['waitingOnApproval'] },
    },
  });
  for (const listener of listeners) listener();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(client.snapshot.threads.find(t => t.id === 'thread-b')?.status).toBe(
    'blocked',
  );
  client.stop();
  expect(listeners.size).toBe(0);
});

test('discovery follows pages and rejects repeated cursors rather than hiding history or looping', async () => {
  const f = fixture();
  f.native.codexCall
    .mockResolvedValueOnce(
      JSON.stringify({
        connectionId: 'one',
        result: { data: [thread], nextCursor: 'next' },
      }),
    )
    .mockResolvedValueOnce(
      JSON.stringify({
        connectionId: 'one',
        result: { data: [{ ...thread, id: 'other' }] },
      }),
    );
  await f.client.refresh();
  expect(f.client.snapshot.threads).toHaveLength(2);
  const repeated = JSON.stringify({
    connectionId: 'one',
    result: { data: [thread], nextCursor: 'same' },
  });
  f.native.codexCall.mockResolvedValue(repeated);
  await expect(f.client.refresh()).rejects.toThrow('repeated history cursor');
});

test('a stop that races with completion refreshes history instead of reporting a broken conversation', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  f.client.event({
    method: 'turn/started',
    params: {
      threadId: 'thread-a',
      turn: { id: 'race', status: 'inProgress', items: [] },
    },
  });
  f.native.codexCall.mockRejectedValueOnce(
    new Error('no active turn to interrupt'),
  );
  await expect(f.client.interrupt('thread-a')).resolves.toBeUndefined();
  expect(
    f.client.snapshot.chats['thread-a'].transcript.turns.every(
      t => t.status !== 'working',
    ),
  ).toBe(true);
});

test('steering messages remain user bubbles while retaining one backend turn identity', () => {
  const state = projectCodex(thread, [
    {
      id: 'one-backend-turn',
      status: 'inProgress',
      items: [
        {
          id: 'first',
          type: 'userMessage',
          content: [{ type: 'text', text: 'Start' }],
        },
        { id: 'progress', type: 'agentMessage', text: 'Working' },
        {
          id: 'steer',
          type: 'userMessage',
          content: [{ type: 'text', text: 'Guidance' }],
        },
        { id: 'continued', type: 'agentMessage', text: 'Continuing' },
      ],
    },
  ]);
  expect(state.transcript.turns.map(t => t.user?.parts[0])).toEqual([
    { id: 'first:0', type: 'text', text: 'Start' },
    { id: 'steer:0', type: 'text', text: 'Guidance' },
  ]);
  expect(state.transcript.turns.map(t => t.status)).toEqual([
    'idle',
    'working',
  ]);
  expect(
    state.transcript.turns
      .flatMap(t => t.assistants)
      .every(m => m.role === 'assistant'),
  ).toBe(true);
});
