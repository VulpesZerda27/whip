import {
  nextPendingPromptExpiry,
  PENDING_PROMPT_SETTLE_FALLBACK_MS,
  settlePendingPrompts,
  transcriptUserCount,
  type PendingPrompt,
} from '../src/lib/pendingPrompts';
import type { TranscriptTurn } from '../src/agentChat';

const prompt = (id: string, state: PendingPrompt['state'], baseline: number, sentAt?: number): PendingPrompt =>
  ({ id, text: id, images: [], state, baseline, sentAt });

test('counts only turns that carry a user prompt', () => {
  const turns = [
    { id: 'a', user: { id: 'u' }, assistants: [], status: 'idle', diffs: [] },
    { id: 'b', assistants: [], status: 'idle', diffs: [] },
  ] as unknown as TranscriptTurn[];
  expect(transcriptUserCount(turns)).toBe(1);
});

test('each new transcript prompt confirms the oldest delivered prompt', () => {
  const pending = [prompt('one', 'sent', 4), prompt('two', 'sending', 4)];
  expect(settlePendingPrompts(pending, 4)).toBe(pending);
  expect(settlePendingPrompts(pending, 5).map(p => p.id)).toEqual(['two']);
  expect(settlePendingPrompts(pending, 6)).toEqual([]);
});

test('queued and failed prompts were never delivered, so they are not confirmed', () => {
  const pending = [prompt('queued', 'queued', 1), prompt('failed', 'failed', 1), prompt('sent', 'sent', 1)];
  expect(settlePendingPrompts(pending, 2).map(p => p.id)).toEqual(['queued', 'failed']);
});

test('a delivered prompt the transcript never echoes stops showing after the fallback', () => {
  const pending = [prompt('stuck', 'sent', 3, 1000), prompt('sending', 'sending', 3)];
  expect(nextPendingPromptExpiry(pending)).toBe(1000 + PENDING_PROMPT_SETTLE_FALLBACK_MS);
  expect(settlePendingPrompts(pending, 3, 1000 + PENDING_PROMPT_SETTLE_FALLBACK_MS - 1)).toBe(pending);
  expect(settlePendingPrompts(pending, 3, 1000 + PENDING_PROMPT_SETTLE_FALLBACK_MS).map(p => p.id)).toEqual(['sending']);
});
