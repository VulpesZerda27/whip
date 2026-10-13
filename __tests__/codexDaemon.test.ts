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

test('an unnamed new chat gets a durable folder title before Herdr resumes it, without sending a prompt', async () => {
  const f = fixture();
  const created = await f.client.create('/home/test/Projects/mobile/', '', '', 'default');
  expect(created.name).toBe('mobile');
  expect(f.calls.map(c => c.payload.method)).toEqual(['thread/start', 'thread/name/set']);
  expect(f.calls[1].payload.params).toEqual({ threadId: 'new-thread', name: 'mobile' });
});

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

test.each(['summary', undefined])(
  'completion with %s items preserves live user messages, tools and intermediate replies',
  async itemsView => {
    const f = fixture();
    await f.client.refresh();
    await f.client.open('thread-a');
    f.client.event({
      method: 'turn/started',
      params: {
        threadId: 'thread-a',
        turn: {
          id: 'peer-turn',
          status: 'inProgress',
          itemsView: 'notLoaded',
          items: [],
        },
      },
    });
    const items = [
      {
        id: 'peer-user',
        type: 'userMessage',
        content: [{ type: 'text', text: 'Sent from the workstation' }],
      },
      { id: 'progress', type: 'agentMessage', text: 'Checking the project.' },
      { id: 'command', type: 'commandExecution', command: 'pwd' },
      {
        id: 'guidance',
        type: 'userMessage',
        content: [{ type: 'text', text: 'Additional guidance' }],
      },
      { id: 'final', type: 'agentMessage', text: 'Partial final' },
    ];
    for (const item of items)
      f.client.event({
        method: 'item/completed',
        params: { threadId: 'thread-a', turnId: 'peer-turn', item },
      });
    const completion: CodexEvent = {
      method: 'turn/completed',
      params: {
        threadId: 'thread-a',
        turn: {
          id: 'peer-turn',
          status: 'completed',
          itemsView,
          items: [
            { id: 'final', type: 'agentMessage', text: 'Complete final' },
          ],
        },
      },
    };
    f.client.event(completion);
    f.client.event(completion);

    const transcript = f.client.snapshot.chats['thread-a'].transcript;
    expect(transcript.messages.map(m => m.id)).toEqual([
      'turn-a:user-a',
      'turn-a:answer-a',
      ...items.map(item => `peer-turn:${item.id}`),
    ]);
    expect(transcript.turns.map(t => t.user?.parts[0])).toEqual([
      { id: 'user-a:0', type: 'text', text: 'Hi' },
      { id: 'peer-user:0', type: 'text', text: 'Sent from the workstation' },
      { id: 'guidance:0', type: 'text', text: 'Additional guidance' },
    ]);
    expect(transcript.messages.at(-1)?.parts).toEqual([
      { id: 'final', type: 'text', text: 'Complete final' },
    ]);
    expect(transcript.turns.every(t => t.status === 'idle')).toBe(true);
    expect(f.calls.map(c => c.payload.method)).toEqual([
      'thread/list',
      'thread/resume',
    ]);
  },
);

test.each(['notLoaded', 'summary', undefined])(
  'an empty %s completion updates status without deleting history',
  async itemsView => {
    const f = fixture();
    await f.client.refresh();
    await f.client.open('thread-a');
    const before = f.client.snapshot.chats['thread-a'].transcript.messages;
    f.client.event({
      method: 'turn/completed',
      params: {
        threadId: 'thread-a',
        turn: { id: 'turn-a', status: 'interrupted', itemsView, items: [] },
      },
    });
    const transcript = f.client.snapshot.chats['thread-a'].transcript;
    expect(transcript.messages).toEqual(before);
    expect(transcript.turns[0].status).toBe('interrupted');
  },
);

test('a summary can supply a final item that was not streamed', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  f.client.event({
    method: 'turn/completed',
    params: {
      threadId: 'thread-a',
      turn: {
        id: 'turn-a',
        status: 'completed',
        itemsView: 'summary',
        items: [
          { id: 'new-final', type: 'agentMessage', text: 'Final from summary' },
        ],
      },
    },
  });
  expect(
    f.client.snapshot.chats['thread-a'].transcript.messages.map(m => m.id),
  ).toEqual(['turn-a:user-a', 'turn-a:answer-a', 'turn-a:new-final']);
});

test.each([{ items: [] }, { items: [turn.items[0]] }])(
  'an explicitly full turn replaces history, including removed items: $items',
  async ({ items }) => {
    const f = fixture();
    await f.client.refresh();
    await f.client.open('thread-a');
    f.client.event({
      method: 'turn/completed',
      params: {
        threadId: 'thread-a',
        turn: { ...turn, items },
      },
    });
    expect(
      f.client.snapshot.chats['thread-a'].transcript.messages.map(m => m.id),
    ).toEqual(items.map(item => `turn-a:${item.id}`));
  },
);

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

test('a transient startup failure retries quietly; persistent failures remain visible and recover', async () => {
  jest.useFakeTimers();
  const f = fixture();
  const call = f.native.codexCall.getMockImplementation()!;
  let fail = true;
  f.native.codexCall.mockImplementation(async (op, raw) => {
    if (fail) throw new Error('Unavailable');
    return call(op, raw);
  });
  try {
    f.client.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.client.snapshot.error).toBeUndefined();
    expect(f.client.snapshot.connected).toBe(false);
    await jest.advanceTimersByTimeAsync(4000);
    expect(f.client.snapshot.error).toContain('Unavailable');
    fail = false;
    await jest.advanceTimersByTimeAsync(4000);
    expect(f.client.snapshot.connected).toBe(true);
    expect(f.client.snapshot.error).toBeUndefined();
  } finally { f.client.stop(); jest.useRealTimers(); }
});

test('a late failure from a stopped connection cannot overwrite reconnect loading', async () => {
  const f = fixture();
  let reject!: (error: Error) => void;
  f.native.codexCall.mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
  f.client.start();
  f.client.stop();
  f.client.offline();
  reject(new Error('Old connection failed'));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(f.client.snapshot.error).toBeUndefined();
  expect(f.client.snapshot.connected).toBe(false);
});

test('background suspension keeps already-drained events from the same healthy connection', async () => {
  const f = fixture();
  const call = f.native.codexCall.getMockImplementation()!;
  let resolve!: (value: string) => void;
  f.native.codexCall.mockImplementation(async (op, raw) => {
    if (op === 'events') return new Promise(r => { resolve = r; });
    return call(op, raw);
  });
  f.client.start();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  f.client.stop();
  resolve(JSON.stringify({ connectionId: 'one', requests: [], events: [{
    method: 'thread/status/changed', params: { threadId: 'thread-b', status: { type: 'active', activeFlags: [] } },
  }] }));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(f.client.snapshot.threads.find(t => t.id === 'thread-b')?.status).toBe('working');
});

test('a burst of streamed deltas is projected and published once per poll', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  const before = f.client.snapshot.chats['thread-a'];
  const changed = jest.fn();
  f.client.subscribe(changed);
  for (const delta of [' One.', ' Two.', ' Three.'])
    f.queue({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-a', turnId: 'turn-a', itemId: 'answer-a', delta },
    });
  f.client.start();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  f.client.stop();
  expect(changed).toHaveBeenCalledTimes(1);
  const after = f.client.snapshot.chats['thread-a'];
  expect(after.transcript.messages.at(-1)?.parts).toContainEqual({
    type: 'text',
    id: 'answer-a',
    text: 'The entire final answer. One. Two. Three.',
  });
  // The untouched user prompt keeps its identity, so its row is not re-rendered.
  expect(after.transcript.messages[0]).toBe(before.transcript.messages[0]);
  expect(after.transcript.turns[0].user).toBe(before.transcript.turns[0].user);
  expect(after.transcript.messages.at(-1)).not.toBe(before.transcript.messages.at(-1));
});

test('events that change nothing visible and quiet refreshes do not publish', async () => {
  const f = fixture();
  await f.client.refresh();
  await f.client.open('thread-a');
  const changed = jest.fn();
  f.client.subscribe(changed);
  f.client.event({
    method: 'thread/name/updated',
    params: { threadId: 'thread-a', threadName: 'A' },
  });
  await f.client.refresh();
  expect(changed).not.toHaveBeenCalled();
  f.client.event({
    method: 'thread/name/updated',
    params: { threadId: 'thread-a', threadName: 'Renamed' },
  });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(f.client.snapshot.threads.find(t => t.id === 'thread-a')?.name).toBe('Renamed');
  expect(f.client.snapshot.chats['thread-a'].transcript.info?.title).toBe('Renamed');
});

test('a re-projection with identical content keeps the previous transcript arrays', () => {
  const first = projectCodex(thread, [structuredClone(turn)]);
  const second = projectCodex(thread, [structuredClone(turn)], 'live', first);
  expect(second.transcript.turns).toBe(first.transcript.turns);
  expect(second.transcript.messages).toBe(first.transcript.messages);
  expect(second.transcript.info).toBe(first.transcript.info);
});
