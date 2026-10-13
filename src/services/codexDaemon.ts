import type {
  AgentChatState,
  TranscriptMessage,
  TranscriptPart,
  TranscriptTurn,
} from '../agentChat';
import type { ElicitationSchema } from '../lib/codexElicitation';
import type { AgentStatus } from '../types';
import type { ChatEffort } from '../lib/chatLaunch';

// Codex's experimental item union evolves independently of Whip. Unknown fields are
// retained at this protocol boundary and only explicitly rendered fields enter the UI.
export type CodexWire = Record<string, unknown>;
export interface CodexItem {
  id: string;
  type: string;
  text?: string;
  content?: unknown[];
  summary?: string[];
  status?: string;
  tool?: string;
  command?: string;
  cwd?: string;
  arguments?: unknown;
  action?: unknown;
  changes?: { path: string; diff?: string }[];
  aggregatedOutput?: string;
  result?: unknown;
  output?: unknown;
  error?: unknown;
  exitCode?: number;
  message?: string;
}
export interface CodexTurn {
  id: string;
  items: CodexItem[];
  itemsView?: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  error?: { message: string };
}
export interface CodexRecord {
  id: string;
  name?: string;
  preview?: string;
  cwd: string;
  updatedAt: number;
  model?: string;
  reasoningEffort?: string;
  status?: { type: string; activeFlags?: string[] };
  turns?: CodexTurn[];
}
export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  hidden?: boolean;
  supportedReasoningEfforts?: { reasoningEffort: string }[];
}
export interface CodexQuestion {
  id: string;
  question: string;
  isSecret?: boolean;
  options?: { label: string; description?: string }[];
}
export interface CodexRequestParams {
  threadId?: string;
  questions?: CodexQuestion[];
  reason?: string;
  message?: string;
  command?: string;
  permissions?: unknown;
  availableDecisions?: unknown[];
  isBlocking?: boolean;
  requestedSchema?: ElicitationSchema;
  url?: string;
}
export interface CodexEvent {
  method: string;
  _whipSeq?: number;
  params: {
    threadId?: string;
    thread?: CodexRecord;
    status?: NonNullable<CodexRecord['status']>;
    threadName?: string;
    turnId?: string;
    turn?: CodexTurn;
    item?: CodexItem;
    itemId?: string;
    delta?: string;
    summaryIndex?: number;
    contentIndex?: number;
  };
}
export interface CodexPage<T> {
  data: T[];
  nextCursor?: string;
}
interface ThreadResult {
  thread: CodexRecord;
  __whipCursor?: number;
}
interface TurnResult {
  turn?: CodexTurn;
}
interface EventPacket {
  connectionId: string;
  events: CodexEvent[];
  requests: Omit<CodexRequest, 'connectionId'>[];
}

export interface CodexTransport {
  codexCall(operation: string, payload: string): Promise<string>;
  subscribeCodexActivity?(listener: () => void): () => void;
}
export interface CodexThread {
  id: string;
  name: string;
  cwd: string;
  updatedAt: number;
  status: AgentStatus;
  model?: string;
  effort?: string;
}
export interface CodexRequest {
  id: string | number;
  method: string;
  params: CodexRequestParams;
  connectionId: string;
}
export interface CodexSnapshot {
  threads: CodexThread[];
  chats: Record<string, AgentChatState>;
  requests: CodexRequest[];
  connected: boolean;
  connectionId?: string;
  error?: string;
  revision: number;
}
const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
export const codexChatKey = (threadId: string) => `codex-thread:${threadId}`;
const CODEX_STREAMING_POLL_MS = 120;
const CODEX_IDLE_POLL_MS = 300;
const CODEX_OFFLINE_POLL_MS = 4000;

export function codexStatus(thread: CodexRecord, done = false): AgentStatus {
  const status = thread.status;
  if (status?.type === 'active') {
    return array(status.activeFlags).some(flag =>
      /waiting|approval|input/i.test(String(flag)),
    )
      ? 'blocked'
      : 'working';
  }
  if (status?.type === 'systemError') return 'blocked';
  return done ? 'done' : 'idle';
}
export function codexThread(value: CodexRecord, done = false): CodexThread {
  return {
    id: str(value.id),
    name: str(value.name) || str(value.preview).slice(0, 90) || 'Codex chat',
    cwd: str(value.cwd),
    updatedAt: value.updatedAt || 0,
    status: codexStatus(value, done),
    model: str(value.model) || undefined,
    effort: str(value.reasoningEffort) || undefined,
  };
}

function itemParts(item: CodexItem): TranscriptPart[] {
  const id = str(item.id);
  const text = (value: unknown) =>
    typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (item.type === 'userMessage')
    return array(item.content).flatMap((raw, i): TranscriptPart[] => {
      const part = raw as {
        type?: string;
        text?: string;
        url?: string;
        path?: string;
      };
      if (part.type === 'text')
        return [{ type: 'text', id: `${id}:${i}`, text: str(part.text) }];
      if (part.type === 'image' || part.type === 'localImage')
        return [
          {
            type: 'image',
            id: `${id}:${i}`,
            source: str(part.url || part.path),
          },
        ];
      return [{ type: 'text', id: `${id}:${i}`, text: text(part) }];
    });
  if (item.type === 'agentMessage')
    return [{ type: 'text', id, text: str(item.text) }];
  if (item.type === 'reasoning')
    return [
      {
        type: 'reasoning',
        id,
        text: [...(item.summary ?? []), ...array(item.content)]
          .map(text)
          .join('\n'),
      },
    ];
  if (item.type === 'plan') return [{ type: 'plan', id, text: str(item.text) }];
  if (item.type === 'contextCompaction')
    return [
      {
        type: 'notice',
        id,
        level: 'info',
        text: 'Conversation context compacted',
      },
    ];
  if (item.type === 'error')
    return [
      {
        type: 'notice',
        id,
        level: 'error',
        text: str(item.message) || text(item),
      },
    ];
  const files = (item.changes ?? []).map(change => ({
    file: str(change.path),
    patch: str(change.diff),
    additions: 0,
    deletions: 0,
  }));
  return [
    {
      type: 'tool',
      id,
      callId: id,
      tool: str(item.tool || item.type),
      state: {
        status:
          item.status === 'inProgress'
            ? 'running'
            : item.status === 'failed' || item.status === 'declined'
              ? 'error'
              : 'completed',
        input: item.command
          ? { command: text(item.command), cwd: str(item.cwd) }
          : item.arguments
            ? { arguments: text(item.arguments) }
            : item.action
              ? { action: text(item.action) }
              : {},
        output:
          item.aggregatedOutput ??
          (item.result
            ? text(item.result)
            : item.output
              ? text(item.output)
              : undefined),
        error: item.error ? text(item.error) : undefined,
        exitCode: typeof item.exitCode === 'number' ? item.exitCode : undefined,
        files,
        diagnostics: [],
        loaded: [],
      },
    },
  ];
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameValue(value, b[index]))
    );
  }
  if (Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(key => sameValue(left[key], right[key]))
  );
}

function sameTurn(a: TranscriptTurn, b: TranscriptTurn): boolean {
  return (
    a.status === b.status &&
    a.startedAt === b.startedAt &&
    a.completedAt === b.completedAt &&
    a.user === b.user &&
    a.assistants.length === b.assistants.length &&
    a.assistants.every((message, index) => message === b.assistants[index]) &&
    sameValue(a.diffs, b.diffs)
  );
}

const sameList = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export function projectCodex(
  thread: CodexRecord,
  rawTurns: CodexTurn[],
  status: AgentChatState['status'] = 'live',
  previous?: AgentChatState,
): AgentChatState {
  // Unchanged messages and turns keep their previous identity, so rows that did
  // not change are skipped by the memoized renderer while a reply streams.
  const previousMessages = new Map(
    previous?.transcript.messages.map(message => [message.id, message]),
  );
  const previousTurns = new Map(
    previous?.transcript.turns.map(turn => [turn.id, turn]),
  );
  const reuseMessage = (message: TranscriptMessage) => {
    const before = previousMessages.get(message.id);
    return before && sameValue(before, message) ? before : message;
  };
  const reuseTurn = (turn: TranscriptTurn) => {
    const before = previousTurns.get(turn.id);
    return before && sameTurn(before, turn) ? before : turn;
  };
  const messages: TranscriptMessage[] = [];
  const turns: TranscriptTurn[] = [];
  for (const turn of rawTurns) {
    let projected: TranscriptTurn = {
      id: str(turn.id),
      assistants: [],
      status:
        turn.status === 'inProgress'
          ? 'working'
          : turn.status === 'interrupted'
            ? 'interrupted'
            : turn.status === 'failed'
              ? 'error'
              : 'idle',
      startedAt: turn.startedAt ?? undefined,
      completedAt: turn.completedAt ?? undefined,
      diffs: [],
    };
    for (const item of turn.items ?? []) {
      const message = reuseMessage({
        id: `${turn.id}:${item.id}`,
        role: item.type === 'userMessage' ? 'user' : 'assistant',
        parts: itemParts(item),
        diffs: [],
        createdAt: turn.startedAt ?? undefined,
      });
      if (message.role === 'user') {
        // A steer is another user message inside the same daemon turn. The shared
        // renderer groups one user per display turn, so split only the presentation.
        if (projected.user || projected.assistants.length) {
          turns.push(reuseTurn({ ...projected, status: 'idle', completedAt: undefined }));
          projected = {
            ...projected,
            id: `${turn.id}:${item.id}`,
            user: undefined,
            assistants: [],
          };
        }
        projected.user = message;
      } else projected.assistants.push(message);
      messages.push(message);
    }
    if (turn.error) {
      const error = reuseMessage({
        id: `${turn.id}:error`,
        role: 'assistant',
        parts: [
          {
            type: 'notice',
            id: `${turn.id}:error`,
            level: 'error',
            text: str(turn.error.message) || JSON.stringify(turn.error),
          },
        ],
        diffs: [],
      });
      messages.push(error);
      projected.assistants.push(error);
    }
    turns.push(reuseTurn(projected));
  }
  const info = { id: thread.id, title: thread.name, directory: thread.cwd };
  const before = previous?.transcript;
  return {
    sessionId: thread.id,
    status,
    transcript: {
      sessionId: thread.id,
      info: before?.info && sameValue(before.info, info) ? before.info : info,
      messages: before && sameList(before.messages, messages) ? before.messages : messages,
      turns: before && sameList(before.turns, turns) ? before.turns : turns,
    },
  };
}

/** True when a projection would render exactly like the previous one. */
function sameChat(a: AgentChatState | undefined, b: AgentChatState): boolean {
  if (!a) return false;
  return (
    a.status === b.status &&
    a.error === b.error &&
    a.transcript.info === b.transcript.info &&
    a.transcript.messages === b.transcript.messages &&
    a.transcript.turns === b.transcript.turns
  );
}

function sameThread(a: CodexThread | undefined, b: CodexThread): boolean {
  if (!a) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.cwd === b.cwd &&
    a.updatedAt === b.updatedAt &&
    a.status === b.status &&
    a.model === b.model &&
    a.effort === b.effort
  );
}

/** One connection per host. Browsing is read-only; only an explicitly opened chat is resumed. */
export class CodexDaemonClient {
  snapshot: CodexSnapshot = {
    threads: [],
    chats: {},
    requests: [],
    connected: false,
    revision: 0,
  };
  private listeners = new Set<() => void>();
  private connectionId = '';
  private metadata = new Map<string, CodexRecord>();
  private turns = new Map<string, CodexTurn[]>();
  private openThreads = new Set<string>();
  private done = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private epoch = 0;
  private failures = 0;
  private unsubscribeWake?: () => void;
  private ticking?: Promise<void>;
  private refreshAt = 0;
  private loading = new Map<string, Promise<void>>();
  private buffered = new Map<string, CodexEvent[]>();
  private snapshotCursor = new Map<string, number>();
  private streaming = false;
  constructor(private native: CodexTransport) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(change: Partial<CodexSnapshot> = {}) {
    this.snapshot = {
      ...this.snapshot,
      ...change,
      revision: this.snapshot.revision + 1,
    };
    this.listeners.forEach(listener => listener());
  }
  async rpc<T = CodexWire>(method: string, params: CodexWire = {}): Promise<T> {
    const epoch = this.epoch;
    const requestConnection = this.connectionId;
    const expectedConnectionId = /^(turn\/|thread\/name\/)/.test(method)
      ? this.connectionId
      : undefined;
    const response = JSON.parse(
      await this.native.codexCall(
        'request',
        JSON.stringify({ method, params, expectedConnectionId }),
      ),
    ) as { connectionId: string; result: T; eventCursor: number };
    if (epoch !== this.epoch)
      throw new Error('Discarded a reply from an obsolete Codex connection');
    if (
      requestConnection &&
      this.connectionId !== requestConnection &&
      response.connectionId !== this.connectionId
    )
      throw new Error('Discarded a reply from an obsolete Codex connection');
    if (this.connectionId && this.connectionId !== response.connectionId) {
      this.publish({ requests: [], connected: false });
      this.openThreads.clear();
      this.snapshotCursor.clear();
    }
    if (this.connectionId !== response.connectionId)
      this.publish({ connectionId: response.connectionId });
    this.connectionId = response.connectionId;
    return { ...response.result, __whipCursor: response.eventCursor };
  }
  async refresh(): Promise<void> {
    const threads = new Map<string, CodexRecord>();
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const result = await this.rpc<CodexPage<CodexRecord>>('thread/list', {
        limit: 100,
        sortKey: 'updated_at',
        archived: false,
        sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'unknown'],
        ...(cursor ? { cursor } : {}),
      });
      for (const thread of result.data)
        if (str(thread.id)) threads.set(thread.id, thread);
      cursor = result.nextCursor || undefined;
      if (cursor && cursors.has(cursor))
        throw new Error('Codex returned a repeated history cursor');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    for (const [id, thread] of threads) {
      const previous = this.metadata.get(id);
      if (thread.status?.type === 'active') this.done.delete(id);
      else if (
        previous?.status?.type === 'active' ||
        (previous && thread.updatedAt > previous.updatedAt)
      )
        this.done.add(id);
      this.metadata.set(id, {
        ...previous,
        ...thread,
        model: thread.model ?? previous?.model,
        reasoningEffort: thread.reasoningEffort ?? previous?.reasoningEffort,
      });
    }
    const current = new Map(this.snapshot.threads.map(t => [t.id, t]));
    const next = [...threads.values()].map(t => {
      const value = codexThread(this.metadata.get(t.id)!, this.done.has(t.id));
      const before = current.get(t.id);
      return before && sameThread(before, value) ? before : value;
    });
    // A periodic refresh that finds nothing new must not re-render every screen.
    const unchanged = sameList(this.snapshot.threads, next);
    if (unchanged && this.snapshot.connected && !this.snapshot.error) return;
    this.publish({
      connected: true,
      error: undefined,
      threads: unchanged ? this.snapshot.threads : next,
    });
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.failures = 0;
    if (this.snapshot.error) this.publish({ error: undefined });
    this.refreshAt = 0;
    this.unsubscribeWake = this.native.subscribeCodexActivity?.(() => {
      void this.tick();
    });
    void this.tick();
  }
  private tick(): Promise<void> {
    if (!this.running) return Promise.resolve();
    if (this.ticking) return this.ticking;
    clearTimeout(this.timer);
    this.ticking = this.poll().finally(() => {
      this.ticking = undefined;
      // Draining the native queue is local, so a reply that is still streaming
      // is polled sooner; an idle connection keeps the slower cadence.
      if (this.running)
        this.timer = setTimeout(
          () => {
            void this.tick();
          },
          !this.snapshot.connected
            ? CODEX_OFFLINE_POLL_MS
            : this.streaming
              ? CODEX_STREAMING_POLL_MS
              : CODEX_IDLE_POLL_MS,
        );
    });
    return this.ticking;
  }
  private async poll() {
    const epoch = this.epoch;
    try {
      if (Date.now() >= this.refreshAt || !this.snapshot.connected) {
        await this.refresh();
        this.refreshAt = Date.now() + 10000;
      }
      const packet = JSON.parse(
        await this.native.codexCall('events', '{}'),
      ) as EventPacket;
      if (epoch !== this.epoch) return;
      if (packet.connectionId !== this.connectionId)
        throw new Error('Codex connection changed');
      this.streaming = packet.events.length > 0;
      this.applyEvents(packet.events);
      const requests = packet.requests.map(r => ({
        ...r,
        connectionId: packet.connectionId,
      }));
      if (JSON.stringify(requests) !== JSON.stringify(this.snapshot.requests))
        this.publish({ requests });
      this.failures = 0;
    } catch (error) {
      // SSH reconnects can finish after an old poll has already failed. Ignore
      // that generation, and allow one automatic retry before surfacing a fault.
      if (this.running && epoch === this.epoch)
        this.offline(++this.failures > 1 ? String(error) : undefined);
    }
  }
  offline(error?: string) {
    this.epoch++;
    this.openThreads.clear();
    const chats = Object.fromEntries(
      Object.entries(this.snapshot.chats).map(([id, chat]) => [
        id,
        { ...chat, status: 'stale' as const },
      ]),
    );
    this.publish({ connected: false, requests: [], error, chats });
  }
  stop() {
    this.running = false;
    this.unsubscribeWake?.();
    this.unsubscribeWake = undefined;
    clearTimeout(this.timer);
  }
  async reload(id: string): Promise<void> {
    await this.refresh();
    this.openThreads.delete(id);
    await this.open(id);
  }
  async open(id: string): Promise<void> {
    if (this.isOpen(id)) return;
    const pending = this.loading.get(id);
    if (pending) return pending;
    const work = this.load(id).finally(() => {
      this.loading.delete(id);
    });
    this.loading.set(id, work);
    return work;
  }
  private async load(id: string) {
    this.buffered.set(id, []);
    try {
      // The daemon atomically sends history and subscribes this client. Native transport
      // records the event boundary of that response, so queued pre-snapshot deltas cannot
      // be appended a second time. This also preserves paginated/backtracked history.
      const result = await this.rpc<ThreadResult>('thread/resume', {
        threadId: id,
      });
      this.metadata.set(id, result.thread);
      const turns = result.thread.turns ?? [];
      // Resume response exposes settings outside the thread record.
      const settings = result as ThreadResult & {
        model?: string;
        reasoningEffort?: string;
      };
      result.thread.model = settings.model ?? result.thread.model;
      result.thread.reasoningEffort =
        settings.reasoningEffort ?? result.thread.reasoningEffort;
      if (turns.some(t => t.itemsView && t.itemsView !== 'full'))
        throw new Error(
          'This Codex daemon returned incomplete history. Update Codex before using this chat.',
        );
      this.snapshotCursor.set(id, result.__whipCursor ?? 0);
      this.turns.set(id, turns);
      this.openThreads.add(id);
      const queued = this.buffered.get(id) ?? [];
      this.buffered.delete(id);
      this.applyEvents(queued, [id]);
    } catch (error) {
      this.buffered.delete(id);
      throw error;
    }
  }
  isOpen(id: string) {
    return this.openThreads.has(id) && this.snapshot.connected;
  }
  /** The thread's next projection, or undefined when it would render the same. */
  private projectChat(id: string): AgentChatState | undefined {
    const metadata = this.metadata.get(id);
    if (!metadata) return undefined;
    const previous = this.snapshot.chats[id];
    const chat = projectCodex(metadata, this.turns.get(id) ?? [], 'live', previous);
    return sameChat(previous, chat) ? undefined : chat;
  }
  private project(id: string) {
    const chat = this.projectChat(id);
    if (!chat) return;
    chat.revision = this.snapshot.revision + 1;
    this.publish({ chats: { ...this.snapshot.chats, [id]: chat } });
  }
  event(event: CodexEvent) {
    this.applyEvents([event]);
  }
  /**
   * Applies a poll's events, then projects each affected thread once and
   * publishes once. Streaming deltas arrive in bursts; projecting and
   * re-rendering per delta made long conversations stutter.
   */
  private applyEvents(events: readonly CodexEvent[], forced: readonly string[] = []) {
    const touched = new Set(forced);
    for (const event of events) {
      const id = this.applyEvent(event);
      if (id) touched.add(id);
    }
    let chats = this.snapshot.chats;
    let threads = this.snapshot.threads;
    for (const id of touched) {
      const chat = this.turns.has(id) ? this.projectChat(id) : undefined;
      if (chat) {
        if (chats === this.snapshot.chats) chats = { ...chats };
        chat.revision = this.snapshot.revision + 1;
        chats[id] = chat;
      }
      const meta = this.metadata.get(id);
      const index = meta ? threads.findIndex(t => t.id === id) : -1;
      if (index < 0) continue;
      const thread = codexThread(meta!, this.done.has(id));
      if (sameThread(threads[index], thread)) continue;
      if (threads === this.snapshot.threads) threads = [...threads];
      threads[index] = thread;
    }
    if (chats !== this.snapshot.chats || threads !== this.snapshot.threads)
      this.publish({ chats, threads });
  }
  /** Applies one event to the retained daemon state; returns its thread when applied. */
  private applyEvent(event: CodexEvent): string | undefined {
    const p = event.params ?? {};
    const id = p.threadId ?? p.thread?.id;
    if (!id) return undefined;
    if (
      typeof event._whipSeq === 'number' &&
      event._whipSeq <= (this.snapshotCursor.get(id) ?? 0)
    )
      return undefined;
    if (this.buffered.has(id)) {
      this.buffered.get(id)!.push(event);
      return undefined;
    }
    if (event.method === 'thread/started') this.metadata.set(id, p.thread!);
    if (event.method === 'turn/started') this.done.delete(id);
    if (event.method === 'turn/completed') this.done.add(id);
    if (event.method === 'thread/status/changed') {
      const meta = this.metadata.get(id);
      if (meta) {
        if (p.status?.type === 'active') this.done.delete(id);
        else if (meta.status?.type === 'active') this.done.add(id);
        meta.status = p.status;
      }
    }
    if (event.method === 'thread/name/updated') {
      const meta = this.metadata.get(id);
      if (meta) meta.name = p.threadName;
    }
    const meta = this.metadata.get(id);
    if (meta && event.method === 'turn/completed') {
      meta.updatedAt = p.turn?.completedAt ?? Math.floor(Date.now() / 1000);
    }
    const turns = this.turns.get(id);
    if (turns) {
      let turn = turns.find(t => t.id === (p.turnId ?? p.turn?.id));
      if (p.turn) {
        if (turn) {
          // Completion events may contain only the final answer (itemsView: summary).
          // Merge partial/legacy payloads by item ID, retaining message order; only an
          // explicitly full snapshot can remove existing items, even when empty.
          const items =
            p.turn.itemsView === 'full'
              ? (p.turn.items ?? [])
              : Array.from(
                  new Map(
                    [...turn.items, ...(p.turn.items ?? [])].map(item => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                );
          Object.assign(turn, p.turn, { items });
        } else {
          turn = { ...p.turn, items: p.turn.items ?? [] };
          turns.push(turn);
        }
      }
      if (turn && p.item) {
        const index = turn.items.findIndex(
          (item: CodexItem) => item.id === p.item!.id,
        );
        if (index >= 0) turn.items[index] = p.item;
        else turn.items.push(p.item);
      }
      if (turn && typeof p.delta === 'string') {
        let item = turn.items.find((value: CodexItem) => value.id === p.itemId);
        if (!item && event.method === 'item/agentMessage/delta') {
          item = { id: p.itemId!, type: 'agentMessage', text: '' };
          turn.items.push(item);
        }
        if (item) {
          if (
            event.method === 'item/agentMessage/delta' ||
            event.method === 'item/plan/delta'
          )
            item.text = (item.text ?? '') + p.delta;
          else if (event.method === 'item/commandExecution/outputDelta')
            item.aggregatedOutput = (item.aggregatedOutput ?? '') + p.delta;
          else if (event.method.includes('reasoning')) {
            const key = event.method.includes('summary')
              ? 'summary'
              : 'content';
            const index = p.summaryIndex ?? p.contentIndex ?? 0;
            item[key] ??= [];
            item[key][index] = str(item[key][index]) + p.delta;
          }
        }
      }
    }
    return id;
  }
  async create(
    cwd: string,
    name: string,
    model: string,
    effort: ChatEffort,
  ): Promise<CodexThread> {
    const result = await this.rpc<ThreadResult>('thread/start', {
      cwd,
      ...(model ? { model } : {}),
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandbox: 'workspace-write',
      config: effort === 'default' ? {} : { model_reasoning_effort: effort },
    });
    const thread = result.thread;
    if (!str(thread?.id))
      throw new Error('Codex did not return a conversation ID');
    this.metadata.set(thread.id, thread);
    this.turns.set(thread.id, []);
    this.openThreads.add(thread.id);
    // Giving a new thread a name also makes Codex persist its empty history,
    // so a Herdr TUI can resume it before the user's first message. Use the
    // selected folder as the default title; never send a synthetic prompt.
    const title = name.trim() || cwd.split('/').filter(Boolean).at(-1) || 'Codex';
    try {
      await this.rpc('thread/name/set', {
        threadId: thread.id,
        name: title,
      });
      thread.name = title;
    } catch {
      /* A rename failure must never duplicate an already-created conversation. */
    }
    this.project(thread.id);
    this.publish({
      threads: [
        codexThread(thread),
        ...this.snapshot.threads.filter(t => t.id !== thread.id),
      ],
    });
    return codexThread(thread);
  }
  async send(
    id: string,
    text: string,
    images: string[],
    model?: string,
    effort?: string,
  ) {
    if (!this.isOpen(id))
      throw new Error(
        'Wait for this conversation to reconnect before sending.',
      );
    const input = [
      ...(text ? [{ type: 'text', text, text_elements: [] }] : []),
      ...images.map(path => ({ type: 'localImage', path })),
    ];
    const turn = this.turns.get(id)?.find(t => t.status === 'inProgress');
    const result = await this.rpc<TurnResult>(
      turn ? 'turn/steer' : 'turn/start',
      {
        threadId: id,
        input,
        ...(turn
          ? { expectedTurnId: turn.id }
          : {
              ...(model ? { model } : {}),
              ...(effort && effort !== 'default' ? { effort } : {}),
            }),
      },
    );
    if (result.turn)
      this.event({
        method: 'turn/started',
        params: { threadId: id, turn: result.turn },
      });
  }
  async interrupt(id: string) {
    const turn = this.turns.get(id)?.find(t => t.status === 'inProgress');
    if (!turn) return;
    try {
      await this.rpc('turn/interrupt', { threadId: id, turnId: turn.id });
    } catch (error) {
      if (!String(error).includes('no active turn to interrupt')) throw error;
      await this.reload(id); // The desktop or completion may win the race with Stop.
    }
  }
  async respond(request: CodexRequest, result: CodexWire) {
    await this.native.codexCall(
      'respond',
      JSON.stringify({
        connectionId: request.connectionId,
        id: request.id,
        result,
      }),
    );
    this.publish({
      requests: this.snapshot.requests.filter(r => r.id !== request.id),
    });
  }
}
const clients = new WeakMap<CodexTransport, CodexDaemonClient>();
export function codexClient(native: CodexTransport) {
  let client = clients.get(native);
  if (!client) {
    client = new CodexDaemonClient(native);
    clients.set(native, client);
  }
  return client;
}
