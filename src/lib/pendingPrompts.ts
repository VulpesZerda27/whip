import type { TranscriptTurn } from '../agentChat';

/**
 * A prompt the user submitted that the agent's transcript does not show yet.
 * Presentation only: delivery and retry stay with each backend.
 */
export type PendingPromptState = 'queued' | 'sending' | 'sent' | 'failed';

export interface PendingPrompt {
  id: string;
  text: string;
  /** Remote image paths that accompany the prompt. */
  images: readonly string[];
  state: PendingPromptState;
  error?: string;
  /** Transcript user prompts at submission; later prompts confirm delivery. */
  baseline: number;
  /** When delivery was acknowledged, for the stuck-bubble fallback. */
  sentAt?: number;
}

/** A sent prompt the transcript never echoes (compaction, a stale tail) stops being shown. */
export const PENDING_PROMPT_SETTLE_FALLBACK_MS = 30_000;

export function transcriptUserCount(turns: readonly TranscriptTurn[]): number {
  let count = 0;
  for (const turn of turns) if (turn.user) count += 1;
  return count;
}

/**
 * Each user prompt the transcript gained since a prompt's baseline confirms the
 * oldest outstanding delivered prompt. Queued and failed prompts were never
 * delivered, so only in-flight and sent prompts can be confirmed.
 */
export function settlePendingPrompts(
  pending: readonly PendingPrompt[],
  userCount: number,
  now = Date.now(),
): readonly PendingPrompt[] {
  if (!pending.length) return pending;
  let confirmed = 0;
  const next = pending.filter(prompt => {
    if (prompt.state !== 'sending' && prompt.state !== 'sent') return true;
    if (userCount - prompt.baseline - confirmed > 0) {
      confirmed += 1;
      return false;
    }
    return !(
      prompt.state === 'sent' &&
      prompt.sentAt !== undefined &&
      now - prompt.sentAt >= PENDING_PROMPT_SETTLE_FALLBACK_MS
    );
  });
  return next.length === pending.length ? pending : next;
}

/** The earliest moment a sent prompt can expire, so callers can re-settle then. */
export function nextPendingPromptExpiry(
  pending: readonly PendingPrompt[],
): number | undefined {
  let next: number | undefined;
  for (const prompt of pending) {
    if (prompt.state !== 'sent' || prompt.sentAt === undefined) continue;
    const expiry = prompt.sentAt + PENDING_PROMPT_SETTLE_FALLBACK_MS;
    if (next === undefined || expiry < next) next = expiry;
  }
  return next;
}
