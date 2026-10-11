import { useEffect, useEffectEvent } from 'react';
import type { CodexHost } from './useCodexHosts';
import type { ChatLibraryController } from './useChatLibrary';
import type { SessionRuntimeController } from './useSessionRuntimeManager';
import {
  acknowledgeCodexActivity,
  codexFingerprint,
  codexNeedsAttention,
  herdrCodexReceipts,
} from '../lib/codexInbox';
import { chatKey } from '../services/chatLibrary';
import { codexChatKey } from '../services/codexDaemon';
import { dismissAgentAlertsForPane } from '../services/alerts';
import { reportBackgroundFailure } from '../services/backgroundOperations';

export function useCodexReadSync(
  hosts: CodexHost[],
  sessions: SessionRuntimeController,
  library: ChatLibraryController,
  enabled: boolean,
) {
  const context = useEffectEvent(() => ({ hosts, sessions, library }));
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;
    // Confirm receipts on consecutive fresh snapshots. A cached idle state from
    // before a newly completed turn must not acknowledge that turn during catch-up.
    let previous = new Map<string, string>();
    async function sync() {
      if (busy) return;
      busy = true;
      const confirmed = new Map<string, string>();
      try {
        const current = context();
        if (!current.library.loaded) return;
        await Promise.all(
          current.hosts.map(async host => {
            const live = current.sessions.presentationSessions.find(
              s => s.id === host.sessionId,
            );
            if (
              live?.connectionStatus !== 'ready' ||
              live.hostState?.freshness !== 'fresh' ||
              !host.snapshot.connected
            )
              return;
            const known = herdrCodexReceipts(live.snapshot.agents);
            const candidates = host.snapshot.threads.filter(
              thread =>
                (thread.status === 'idle' || thread.status === 'done') &&
                known.has(thread.id) &&
                codexNeedsAttention(
                  thread,
                  false,
                  current.library.value.activity[
                    chatKey(host.hostId, codexChatKey(thread.id))
                  ],
                ),
            );
            if (!candidates.length) return;
            try {
              const fresh = await current.sessions.refreshSnapshot(
                host.sessionId,
              );
              if (stopped || !fresh) return;
              const latest = context();
              const session = latest.sessions.presentationSessions.find(
                s => s.id === host.sessionId,
              );
              if (
                session?.connectionStatus !== 'ready' ||
                session.hostState?.freshness !== 'fresh' ||
                session.hostState?.connectionGeneration !==
                  live.hostState?.connectionGeneration ||
                !host.client.snapshot.connected ||
                host.client.snapshot.connectionId !== host.snapshot.connectionId
              )
                return;
              const receipts = herdrCodexReceipts(fresh.agents);
              const seen = new Map<string, string>();
              for (const thread of candidates) {
                const receipt = receipts.get(thread.id);
                if (!receipt) continue;
                const key = chatKey(host.hostId, codexChatKey(thread.id));
                const fingerprint = codexFingerprint(thread);
                const proof = JSON.stringify([
                  host.snapshot.connectionId,
                  live.hostState?.connectionGeneration,
                  fingerprint,
                  receipt,
                ]);
                confirmed.set(key, proof);
                if (previous.get(key) === proof)
                  seen.set(thread.id, fingerprint);
              }
              const threads = host.client.snapshot.threads.filter(
                thread =>
                  !host.client.snapshot.requests.some(
                    r =>
                      r.params.threadId === thread.id &&
                      r.params.isBlocking !== false,
                  ),
              );
              latest.library.update(old =>
                acknowledgeCodexActivity(old, host.hostId, seen, threads),
              );
              for (const thread of threads) {
                if (seen.get(thread.id) !== codexFingerprint(thread)) continue;
                reportBackgroundFailure(
                  dismissAgentAlertsForPane(
                    host.hostId,
                    codexChatKey(thread.id),
                  ),
                  'codex-read-alert',
                );
              }
            } catch {
              // Read synchronization is optional while a host reconnects. Preserve unread.
            }
          }),
        );
      } finally {
        previous = confirmed;
        busy = false;
      }
    }
    void sync();
    const timer = setInterval(() => {
      void sync();
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled]);
}
