// Opt-in integration check: node scripts/test-codex-daemon-live.cjs [--write]
// Read-only by default. --write creates and archives one isolated test conversation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const WebSocket = require('ws');
const root = path.resolve(__dirname, '..');
const source = ts.transpileModule(
  fs.readFileSync(path.join(root, 'src/services/codexDaemon.ts'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const implementation = new Module(path.join(root, 'codex-test-runtime.cjs'));
implementation.paths = module.paths;
implementation._compile(source, path.join(root, 'codex-test-runtime.cjs'));
const { CodexDaemonClient } = implementation.exports;
let serial = 0;
class Transport {
  constructor() {
    this.pending = new Map();
    this.events = [];
    this.requests = new Map();
    this.sequence = 0;
    this.connectionId = String(++serial);
  }
  async connect() {
    this.socket = new WebSocket(
      `ws+unix://${os.homedir()}/.codex/app-server-control/app-server-control.sock:/`,
    );
    await new Promise((r, j) => {
      this.socket.once('open', r);
      this.socket.once('error', j);
    });
    this.socket.on('message', raw => {
      const value = JSON.parse(raw);
      if (value.id !== undefined && !value.method) {
        const pending = this.pending.get(value.id);
        if (pending) {
          this.pending.delete(value.id);
          clearTimeout(pending.timer);
          value.error
            ? pending.reject(new Error(JSON.stringify(value.error)))
            : pending.resolve({
                connectionId: this.connectionId,
                eventCursor: this.sequence,
                result: value.result,
              });
        }
        return;
      }
      if (value.id !== undefined) this.requests.set(value.id, value);
      if (value.method === 'serverRequest/resolved')
        this.requests.delete(value.params.requestId);
      value._whipSeq = ++this.sequence;
      this.events.push(value);
    });
    this.socket.on('error', () => {});
    await this.call('initialize', {
      clientInfo: { name: 'whip_chat_live_test', version: '1' },
      capabilities: { experimentalApi: true },
    });
    this.socket.send(JSON.stringify({ method: 'initialized', params: {} }));
  }
  call(method, params) {
    return new Promise((resolve, reject) => {
      const id = `test-${++serial}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Timed out: ' + method));
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async codexCall(op, payload) {
    const p = JSON.parse(payload);
    if (op === 'request')
      return JSON.stringify(await this.call(p.method, p.params));
    if (op === 'events') {
      const result = {
        connectionId: this.connectionId,
        events: this.events,
        requests: [...this.requests.values()],
      };
      this.events = [];
      return JSON.stringify(result);
    }
    if (op === 'respond') {
      this.socket.send(JSON.stringify({ id: p.id, result: p.result }));
      this.requests.delete(p.id);
      return 'null';
    }
    throw new Error('Unknown operation');
  }
  close() {
    this.socket?.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Closed'));
    }
    this.pending.clear();
  }
}
async function run() {
  const transport = new Transport();
  const peer = new Transport();
  let client, observer, threadId, directory;
  try {
    await transport.connect();
    client = new CodexDaemonClient(transport);
    await client.refresh();
    console.log(
      JSON.stringify({
        check: 'discovery',
        threads: client.snapshot.threads.length,
      }),
    );
    if (!process.argv.includes('--write')) return;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-codex-qa-'));
    const started = await client.rpc('thread/start', {
      cwd: directory,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandbox: 'workspace-write',
      config: { 'features.hooks': false },
    });
    threadId = started.thread.id;
    await client.rpc('thread/name/set', {
      threadId,
      name: 'Whip daemon integration QA',
    });
    await client.open(threadId);
    client.start();
    await peer.connect();
    observer = new CodexDaemonClient(peer);
    await observer.refresh();
    await observer.open(threadId);
    observer.start();
    await client.send(
      threadId,
      'Reply with exactly WHIP_DAEMON_QA_OK. Do not use tools or modify files.',
      [],
    );
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const chat = observer.snapshot.chats[threadId];
      const text = chat?.transcript.messages
        .filter(m => m.role === 'assistant')
        .flatMap(m => m.parts)
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n');
      if (
        text?.includes('WHIP_DAEMON_QA_OK') &&
        chat.transcript.turns.every(t => t.status !== 'working')
      )
        break;
      await new Promise(r => setTimeout(r, 300));
    }
    const before = observer.snapshot.chats[threadId];
    if (
      !before.transcript.messages.some(
        m =>
          m.role === 'assistant' &&
          m.parts.some(
            p => p.type === 'text' && p.text.includes('WHIP_DAEMON_QA_OK'),
          ),
      )
    )
      throw new Error('Peer did not receive complete reply');
    await client.send(
      threadId,
      'Use a terminal tool to run sleep 20, then reply WAITED. Do not modify files.',
      [],
    );
    const guidance = client.send(
      threadId,
      'Additional guidance: no file changes.',
      [],
    );
    const guided = guidance.then(
      () => true,
      () => false,
    );
    await new Promise(r => setTimeout(r, 300));
    await client.interrupt(threadId);
    await guided;
    const interruptedDeadline = Date.now() + 20000;
    while (
      Date.now() < interruptedDeadline &&
      observer.snapshot.chats[threadId].transcript.turns.some(
        t => t.status === 'working',
      )
    ) {
      await new Promise(r => setTimeout(r, 100));
    }
    const interrupted = observer.snapshot.chats[threadId].transcript.turns;
    if (!interrupted.some(t => t.status === 'interrupted'))
      throw new Error('Peer did not observe interruption');
    console.log(
      JSON.stringify({ check: 'start-steer-interrupt', passed: true }),
    );
    observer.stop();
    peer.close();
    const fresh = new Transport();
    await fresh.connect();
    try {
      const reconnected = new CodexDaemonClient(fresh);
      await reconnected.refresh();
      await reconnected.open(threadId);
      const after = reconnected.snapshot.chats[threadId];
      if (
        after.transcript.messages
          .filter(m => m.role === 'assistant')
          .flatMap(m => m.parts)
          .filter(
            p => p.type === 'text' && p.text.includes('WHIP_DAEMON_QA_OK'),
          ).length !== 1
      )
        throw new Error('Reconnect lost or duplicated final answer');
      console.log(
        JSON.stringify({
          check: 'send-peer-events-reconnect',
          passed: true,
          turns: after.transcript.turns.length,
        }),
      );
    } finally {
      fresh.close();
    }
  } finally {
    client?.stop();
    observer?.stop();
    if (threadId) {
      try {
        await transport.call('thread/archive', { threadId });
      } catch (e) {
        console.error('Test thread cleanup:', String(e));
      }
    }
    transport.close();
    peer.close();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
}
run().catch(e => {
  console.error(String(e));
  process.exitCode = 1;
});
