import type { CodexThread } from '../services/codexDaemon';
import type { ChatActivity, ChatLibrary } from '../services/chatLibrary';
import { chatKey } from '../services/chatLibrary';
import { codexChatKey } from '../services/codexDaemon';
import type { AgentInfo } from '../types';

// Herdr's idle means seen; done means idle but unseen. Only an explicit
// integration-owned conversation ID can connect that receipt to a daemon thread.
export function herdrCodexReceipts(agents: AgentInfo[]): Map<string, string> {
  const groups = new Map<string, AgentInfo[]>();
  for (const agent of agents) {
    const ref = agent.agent_session;
    if (
      agent.agent !== 'codex' ||
      ref?.agent !== 'codex' ||
      ref.source !== 'herdr:codex' ||
      ref.kind !== 'id' ||
      !ref.value
    )
      continue;
    groups.set(ref.value, [...(groups.get(ref.value) ?? []), agent]);
  }
  return new Map(
    [...groups].flatMap(([id, panes]) =>
      panes.every(
        p =>
          p.agent_status === 'idle' &&
          !p.launch_pending &&
          p.state_change_seq !== undefined,
      )
        ? [
            [
              id,
              JSON.stringify(
                panes.map(p => [p.pane_id, p.state_change_seq]).sort(),
              ),
            ],
          ]
        : [],
    ),
  );
}

export function acknowledgeCodexActivity(
  previous: ChatLibrary,
  hostId: string,
  receipts: Map<string, string>,
  threads: CodexThread[],
): ChatLibrary {
  let next = previous;
  for (const thread of threads) {
    const fingerprint = codexFingerprint(thread);
    const key = chatKey(hostId, codexChatKey(thread.id));
    const old = next.activity[key];
    if (
      (thread.status !== 'idle' && thread.status !== 'done') ||
      receipts.get(thread.id) !== fingerprint ||
      !old ||
      old.seen === fingerprint
    )
      continue;
    next = {
      ...next,
      activity: { ...next.activity, [key]: { ...old, seen: fingerprint } },
    };
  }
  return next;
}

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
