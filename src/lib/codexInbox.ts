import type { CodexThread } from '../services/codexDaemon';
import type { ChatActivity, ChatLibrary } from '../services/chatLibrary';
import { chatKey } from '../services/chatLibrary';
import { codexChatKey } from '../services/codexDaemon';

export const codexFingerprint = (thread: CodexThread) =>
  JSON.stringify([
    thread.updatedAt,
    thread.status === 'done' ? 'idle' : thread.status,
  ]);
export function codexNeedsAttention(
  thread: CodexThread,
  pending: boolean,
  activity?: ChatActivity,
) {
  return (
    pending ||
    thread.status === 'blocked' ||
    Boolean(
      activity &&
      (thread.status === 'done' || thread.status === 'idle') &&
      activity.seen !== codexFingerprint(thread),
    )
  );
}
export function updateCodexActivity(
  previous: ChatLibrary,
  hosts: { hostId: string; threads: CodexThread[] }[],
  selected?: { hostId: string; threadId: string } | null,
): ChatLibrary {
  const activity = { ...previous.activity };
  let changed = false;
  for (const host of hosts)
    for (const thread of host.threads) {
      const key = chatKey(host.hostId, codexChatKey(thread.id));
      const fingerprint = codexFingerprint(thread);
      const old = activity[key];
      // Historical conversations are a baseline, not dozens of new completion alerts.
      const seen =
        !old ||
        (selected?.hostId === host.hostId && selected.threadId === thread.id)
          ? fingerprint
          : old.seen;
      if (old?.fingerprint !== fingerprint || old.seen !== seen) {
        activity[key] = {
          fingerprint,
          seen,
          updatedAt: thread.updatedAt * 1000,
        };
        changed = true;
      }
    }
  return changed
    ? {
        ...previous,
        activity: Object.fromEntries(
          Object.entries(activity)
            .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
            .slice(0, 500),
        ),
      }
    : previous;
}
