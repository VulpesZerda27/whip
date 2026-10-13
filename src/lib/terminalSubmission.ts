export interface TerminalSubmission {
  historyEntry: string;
  pasteEvents: string[];
}

/**
 * Keep composer text and attachments as distinct paste events. The renderer
 * inserts separators outside those events before sending Enter.
 */
export function composeTerminalSubmission(
  text: string,
  attachmentPaths: readonly string[],
): TerminalSubmission {
  const pasteEvents = [text.trimEnd(), ...attachmentPaths].filter(Boolean);
  return {
    historyEntry: pasteEvents.join(' '),
    pasteEvents,
  };
}

/**
 * Agents such as Claude Code turn a pasted file path into an attachment after a
 * short paste debounce (about 100 ms). An Enter in the same burst submits the
 * text without the image, so submissions with attachments pause before Enter.
 * Mirrors `ATTACHMENT_SUBMIT_SETTLE` in the native pane submission.
 */
export const ATTACHMENT_SUBMIT_SETTLE_MS = 400;

/** Where native attachment uploads land on the host. */
const ATTACHMENT_UPLOAD_DIRECTORY = '/.whip/uploads/';

/** Composer text comes first, so any further paste is an attachment path. */
export function terminalSubmissionSettleMs(pastedParts: readonly string[]): number {
  const parts = pastedParts.filter(Boolean);
  const hasAttachments = parts.length > 1
    || parts.some(part => part.includes(ATTACHMENT_UPLOAD_DIRECTORY));
  return hasAttachments ? ATTACHMENT_SUBMIT_SETTLE_MS : 0;
}

/** Convert xterm's captured paste output into ordered terminal writes. */
export function terminalSubmissionWrites(pastedParts: readonly string[]): string[] {
  const writes: string[] = [];
  for (const part of pastedParts) {
    if (writes.length > 0) writes.push(' ');
    writes.push(part);
  }
  writes.push('\r');
  return writes;
}
