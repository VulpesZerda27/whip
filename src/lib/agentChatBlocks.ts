import type { TranscriptMessage, TranscriptPart, TranscriptToolPart, TranscriptTurn } from '../agentChat';
import type { PendingPrompt, PendingPromptState } from './pendingPrompts';

type BlockContent =
  | { type: 'user'; message: TranscriptMessage; pending?: PendingPromptState; pendingError?: string }
  | { type: 'part'; part: TranscriptPart; streaming: boolean }
  | { type: 'thinking' }
  | { type: 'error'; error: string }
  | { type: 'changes'; turn: TranscriptTurn }
  | { type: 'diff'; file: TranscriptTurn['diffs'][number] }
  | { type: 'meta'; turn: TranscriptTurn };

export type ChatBlock = BlockContent & {
  id: string;
  turnId: string;
  spacing: 'turn' | 'part' | 'none';
};

export function isRunningTool(part: TranscriptToolPart): boolean {
  return part.state.status === 'pending' || part.state.status === 'running';
}

const QUESTION_TOOLS = new Set(['question', 'askuserquestion', 'request_user_input', 'request_user_input_async']);

export function isQuestionTool(part: TranscriptToolPart): boolean {
  return QUESTION_TOOLS.has(part.tool.toLowerCase().split(' · ').at(-1)?.split('.').at(-1) ?? '');
}

function renderable(part: TranscriptPart): boolean {
  if (part.type === 'text' || part.type === 'reasoning') return Boolean(part.text.trim());
  // Claude retains original tool names, including TodoWrite, without a separate plan.
  if (part.type === 'tool') return part.tool !== 'todowrite' || part.state.status === 'error';
  return part.type === 'plan' || part.type === 'notice';
}

/** Presentation rows only: transcript ownership and reconciliation stay in Rust. */
export function transcriptBlocks(
  turns: readonly TranscriptTurn[],
  agentWorking: boolean,
  expanded: ReadonlySet<string>,
  pending: readonly PendingPrompt[] = [],
): ChatBlock[] {
  const delivering = pending.some(prompt => prompt.state === 'sending' || prompt.state === 'sent');
  const blocks = turns.flatMap((turn, turnIndex) => {
    const rows: ChatBlock[] = [];
    const key = (...parts: string[]) => JSON.stringify([turn.id, ...parts]);
    const push = (id: string, content: BlockContent) => rows.push({
      ...content,
      id,
      turnId: turn.id,
      spacing: rows.length === 0
        ? (turnIndex ? 'turn' : 'none')
        : content.type === 'meta' || content.type === 'changes' ? 'none' : 'part',
    });
    if (turn.user) push(key('user', turn.user.id), { type: 'user', message: turn.user });
    const parts = turn.assistants.flatMap(message => message.parts
      .filter(renderable)
      .map(part => ({ part, message, id: key('part', message.id, part.id) })));
    const tail = parts.at(-1);
    const working = turnIndex === turns.length - 1 && (agentWorking || turn.status === 'working');
    const streamingId = working && tail && tail.message.completedAt === undefined
      && (tail.part.type === 'text' || tail.part.type === 'reasoning') ? tail.id : undefined;
    for (const item of parts) {
      push(item.id, { type: 'part', part: item.part, streaming: item.id === streamingId });
    }
    // A prompt being delivered owns the trailing activity row, so it is not shown twice.
    if (working && !delivering && turn.status !== 'error' && !streamingId
      && !parts.some(({ part }) => part.type === 'tool' && isRunningTool(part))) {
      push(key('thinking'), { type: 'thinking' });
    }
    for (const message of turn.assistants) {
      if (message.error) push(key('error', message.id), { type: 'error', error: message.error });
    }
    if (turn.diffs.length) {
      const id = key('changes');
      push(id, { type: 'changes', turn });
      if (expanded.has(id)) turn.diffs.forEach((file, index) => {
        push(key('diff', file.file, String(index)), { type: 'diff', file });
      });
    }
    // A stable final row also anchors initial readiness for empty/working turns.
    push(key('meta'), { type: 'meta', turn });
    return rows;
  });
  for (const prompt of pending) {
    blocks.push({
      type: 'user',
      id: `pending:${prompt.id}`,
      turnId: `pending:${prompt.id}`,
      spacing: blocks.length ? 'turn' : 'none',
      message: pendingPromptMessage(prompt),
      pending: prompt.state,
      pendingError: prompt.error,
    });
  }
  if (delivering && (agentWorking || pending.some(prompt => prompt.state === 'sent'))) {
    blocks.push({ type: 'thinking', id: 'pending:thinking', turnId: 'pending', spacing: 'part' });
  }
  return blocks;
}

const pendingMessages = new WeakMap<PendingPrompt, TranscriptMessage>();

/** A stable synthetic user message, so a pending row re-renders only when its prompt changes. */
function pendingPromptMessage(prompt: PendingPrompt): TranscriptMessage {
  const cached = pendingMessages.get(prompt);
  if (cached) return cached;
  const message: TranscriptMessage = {
    id: `pending:${prompt.id}`,
    role: 'user',
    parts: [
      ...prompt.images.map((source, index) => ({ type: 'image' as const, id: `pending:${prompt.id}:image:${index}`, source })),
      ...(prompt.text ? [{ type: 'text' as const, id: `pending:${prompt.id}:text`, text: prompt.text }] : []),
    ],
    diffs: [],
  };
  pendingMessages.set(prompt, message);
  return message;
}

function sameBlock(previous: ChatBlock, next: ChatBlock): boolean {
  const before = previous as unknown as Record<string, unknown>;
  const after = next as unknown as Record<string, unknown>;
  const keys = Object.keys(after);
  if (keys.length !== Object.keys(before).length) return false;
  return keys.every(key => before[key] === after[key]);
}

/**
 * Reuse the previous row object whenever its content is unchanged. Rows are
 * memoized by identity, so streaming one reply re-renders only that reply.
 */
export function stabilizeBlocks(
  previous: readonly ChatBlock[],
  next: ChatBlock[],
): ChatBlock[] {
  if (!previous.length) return next;
  const byId = new Map(previous.map(block => [block.id, block]));
  let unchanged = previous.length === next.length;
  const stable = next.map((block, index) => {
    const before = byId.get(block.id);
    const value = before && sameBlock(before, block) ? before : block;
    if (value !== previous[index]) unchanged = false;
    return value;
  });
  return unchanged ? (previous as ChatBlock[]) : stable;
}
