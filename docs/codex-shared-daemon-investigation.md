# Codex shared-daemon investigation

Investigated 2026-10-10. This document proposes a fix; it does not implement one.
No Codex/Herdr configuration, hooks, binaries, or running agents were changed
during this investigation. The separately requested removal of Whip's Resume
last chat controls ships in 1.8.10.

## Recommendation

Revised after the user's feedback: maintaining a modified Codex client is not
viable for this setup. Keep official Codex and the shared daemon. The preferred
direction is a direct Codex app-server backend in Whip, with conversations keyed
by host and full thread ID rather than by Herdr pane.

That removes the chat UI's dependence on the broken pane association. Existing
Codex conversations can be discovered by the daemon API; new chats would retain
the thread ID returned when created. The intended desktop/phone behavior is to
access the same backend conversation. Full history, concurrent interaction and
reconnection still need isolated validation before this design is considered
ready to implement. Current evidence establishes read-only connectivity and
metadata discovery on all four hosts, not those complete flows.

Opening the exact existing terminal pane is optional under this design. Where
the association is unknown, a terminal action could attach a TUI explicitly to
the selected thread instead. The old recommendation over-prioritized preserving
exact pane linkage and is withdrawn. Its proposed client reporter remains below
as a possible upstream solution, not a requirement for Whip's chat backend.

This direction requires more work in Whip, including native transport and
conversation-state migration, but no Codex fork. The daemon API's experimental
surfaces require compatibility tests, particularly for existing paginated
history. Claude's existing backend can remain in use. No integration changes
have been implemented.

## Confirmed cause

The affected workstation had two Codex TUI clients in distinct Herdr panes and
one shared daemon. Each TUI process had its own correct `HERDR_PANE_ID`. The
daemon retained the environment of the pane that originally started it.

The installed Herdr Codex hook receives the correct conversation ID in the hook
payload, but gets the destination pane from `HERDR_PANE_ID` in its environment.
Codex constructs hook runtimes from the daemon process environment. Consequently,
hooks for both conversations can report different thread IDs to the same pane.
Herdr permits Codex startup/resume reports to replace the previous association.
This explains both observations: the clipboard conversation had no association,
and its thread ID appeared on the other pane instead.

The initial mapping was checked against session titles, transcript contents and
the final answer in the terminal, then manually repaired before this investigation.
That repair does not prevent another incorrect hook report.

Evidence:

- The installed Herdr hook matches the v0.9.1 integration, version 8. It reads
  `pane_id` from the environment and `session_id` from the payload. Its optional
  `CODEX_THREAD_ID` guard does not help when that environment variable is absent,
  as it was in the shared daemon.
  [Installed-version hook source](https://github.com/herdrdev/herdr/blob/v0.9.1/src/integration/assets/codex/herdr-agent-state.sh).
- Codex 0.162.1 snapshots `std::env::vars_os()` when constructing the hook
  runtime and replays that environment when running the command. The same
  construction was also checked in 0.157.1 and 0.159.2.
  [Hook registry](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/hooks/src/registry.rs#L79),
  [command runner](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/hooks/src/engine/command_runner.rs#L424).
- Herdr explicitly permits same-source Codex association replacement for
  startup, clear, resume and compact events. Sequence numbers order reports;
  they cannot correct a report addressed to the wrong pane.
  [Herdr replacement policy](https://github.com/herdrdev/herdr/blob/v0.9.1/src/terminal/state.rs#L1320).
- An isolated reproduction ran the unmodified installed hook with two synthetic
  thread IDs, one inherited pane ID and a private fake Unix socket. Both
  reports targeted the same pane. It did not contact the real Herdr socket or
  send a prompt to an agent.

The inspected upstream Herdr hook, integration version 9 at commit
`2563803dca97c040beaf3dc3acdcb5a3221b4238`, still takes the pane from the
environment. It adds lifecycle reports but does not solve this ownership issue.
Simply upgrading that integration is insufficient.

## Server inventory and transport tests

All four hosts run Herdr 0.9.1 with Codex integration version 8. Versions below
were read from the installed CLI and `codex app-server daemon version`;
the running managed daemon can differ from the CLI on PATH.

| Host | CLI version | Running daemon | Read-only API result |
| --- | --- | --- | --- |
| Workstation | 0.159.2 | 0.162.1 | Successful through its Unix socket |
| Prohosting24 | 0.162.1 | 0.162.1 | Successful through SSH exec proxy |
| Pangolin | 0.157.1 | 0.159.0 | Successful through SSH exec proxy |
| Heast | 0.162.1 | 0.162.1 | Successful through SSH exec proxy |

The workstation API listed both loaded conversations and returned each one's
metadata and runtime status using its exact thread ID. The VPS probes listed
loaded IDs, listed one saved thread, and read that thread's metadata. No new
thread, resume, prompt, approval decision or configuration update was sent.

For remote access, the working transport was a non-PTY SSH exec channel running
`codex app-server proxy --sock <daemon-socket>`, with WebSocket framing over
the proxied bytes. The proxy is a byte relay, not a JSONL adapter. The probe
used a temporary local Unix socket to connect a WebSocket client to that stream.
An eventual native implementation should use Whip's authenticated SSH transport.

An initial SSH Unix-socket-forwarding probe failed on Pangolin. Direct socket
handshake and the exec proxy both worked, so this was not evidence of an older
WebSocket format. The exec route avoids depending on SSH stream-local forwarding
and required no SSH configuration changes. Temporary probe connections and
sockets were cleaned up.

The tested requests were `initialize`, `thread/loaded/list`, `thread/list`
(remote probes), and `thread/read` with `includeTurns: false`. These establish
transport and identity feasibility, not complete compatibility for history,
events, concurrent clients or writing. Read-only inspection does not require
resuming the thread. [App-server API documentation](https://learn.chatgpt.com/docs/app-server).

## Why existing metadata is insufficient

The daemon knows conversation IDs and connected/subscribed clients. The examined
protocol does not expose an authoritative Herdr pane → currently visible thread
mapping. Initialization supplies a client name/title/version, not its terminal
identity. Thread metadata includes directory, name and status, but no Herdr pane.
[Initialization schema](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server-protocol/src/protocol/v1.rs#L29).

More subtly, a TUI can retain subscriptions to multiple threads and switch its
visible thread locally. An app-server subscription or a SessionStart hook is
therefore not necessarily a change of visible conversation. The TUI's
`active_thread_id` is the relevant source of truth.
[Thread switching](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/tui/src/app/session_lifecycle.rs#L620).

These approaches do not provide a durable fix:

| Approach | Limitation |
| --- | --- |
| Latest transcript, matching directory or title | Multiple conversations can share a directory/title; both affected conversations shared a directory. |
| Daemon PID or its open transcript files | One process owns multiple conversations. |
| One-time launch wrapper recording `codex resume <id>` | Can establish the initial association but misses later in-TUI conversation changes. |
| Per-thread hook environment overrides | Can bind a backend thread's hooks to its initial terminal, but do not represent multiple viewers or subsequent client selection. |
| Terminal title containing the thread ID | In 0.162.1 the session-ID title component is truncated to 32 characters; the UUID is 36. Titles are also mutable display text. |
| Manual Herdr association repair | A later incorrect hook can overwrite it. |
| `--no-daemon` | Avoids this shared environment collision, but gives up shared-daemon operation and still does not model all client-side thread selection. |
| Whip connects to the daemon directly | Solves direct chat identity, but does not identify which existing desktop pane is displaying that chat. |

The title truncation is in the
[0.162.1 title renderer](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/tui/src/chatwidget/status_surfaces.rs#L949).

## Alternative requiring upstream support or a Codex patch

Preserving authoritative mapping to the exact existing terminal pane would
require three parts. This is not the selected approach for our setup:

1. **Codex TUI reports its own displayed thread.** Send the full thread ID when
   initial selection completes, when a thread is resumed or newly created,
   and whenever the user selects a different thread. Clear the association
   when there is no selected conversation or the client exits. Reports must
   originate from the TUI process that owns the pane, not a background hook
   inside the daemon. A client-side local socket reporter is a reasonable
   first implementation; a generic terminal integration event is an upstream
   alternative. This is proposed functionality, not an available CLI option.
2. **Herdr owns association validation.** Scope reports to its server instance,
   stable terminal identity and current client generation. Use a monotonic
   per-client sequence, reject late reports from replaced clients, clear state
   on terminal/process teardown, and allow two terminals to display the same
   thread. Treat association and agent activity as separate facts. Legacy
   daemon-origin hooks must not overwrite a client-owned association; merely
   adding a second reporter leaves the original race intact. Lifecycle updates
   must be matched to the thread or fanned out to its viewers, not addressed
   using the daemon's inherited pane.
3. **Whip handles missing associations explicitly.** Consume authoritative
   associations, invalidate transcript bindings when their generation changes,
   and show a short Chat-unavailable state with an explicit Terminal action
   when identity is unavailable. Do not silently guess another conversation
   or surprise the user by switching modes. Existing Rust binding tokens and
   generation checks are a useful foundation, not a replacement for correct
   upstream identity.

Relevant implementation areas are Codex's TUI thread-routing/session lifecycle,
Herdr's Codex integration and terminal state ownership, and Whip's
`packages/react-native-whip-ssh/rust/src/agent_sessions.rs` and chat-opening UI.
The exact event and RPC schema should be specified before implementation.

The practical cost is maintaining a Codex client patch until upstream supports
this signal. Auto-updates must not silently replace that patched client. This
needs a deliberate version/deployment strategy on all four servers; it is not
a reason to restart existing work or downgrade the daemon during investigation.

## Preferred architecture: native daemon-backed Codex chats

Whip should make `(host, provider, thread.id)` its Codex conversation identity
and access the app-server through SSH. Opening a terminal could explicitly
attach a new TUI to that known ID when no reliable existing-pane association is
available. That terminal behavior should be made clear in the UI.

This would reuse chat rendering, voice, file access and server credentials, but
requires a provider transport, API-event projection, reconnect reconciliation,
approval handling and migration of pane-keyed drafts/unread state. Listing,
reading and opening conversations should not inadvertently resume every saved
thread. Keep client capabilities separate from the CLI version: the live daemon
can update independently. The documented WebSocket transport and history paging
include experimental surfaces, so pin and test the protocol versions used.
[Transport and history documentation](https://learn.chatgpt.com/docs/app-server).

Benefits would include explicit conversation IDs, structured messages and
approval interactions, and conversations that do not depend on an open terminal.
Sharing the daemon also allows supported clients to attach to the same backend
threads. This investigation did not measure memory or performance, so it makes
no quantitative resource-saving claim.

## Required validation before rollout

Use isolated test conversations and a test Herdr instance before modifying live
sessions. The acceptance matrix must cover:

- Two panes in the same directory, started in either order and concurrently.
- New, resume, fork and local selection of already loaded threads in the TUI.
- Two TUI clients displaying the same conversation, then one switching away.
- Late hook reports, client crashes, pane reuse and daemon/Herdr restarts.
- Whip reconnecting or returning from the background while the visible thread
  changes; drafts, unread markers and cached history stay with the right chat.
- Busy, done and blocked states without cross-pane contamination.
- Claude behavior, terminal fallback, file links and images remain functional.

For a native daemon backend, additionally test paginated full history, final
message delivery, event gaps and resubscription, desktop/phone approval races,
turn start/steer/interrupt, model/effort and auto-review settings, and recovery
after socket loss across the deployed daemon versions. None of these mutating
flows were exercised against the user's live conversations in this investigation.

Roll out first on the workstation using isolated sessions, then one VPS, then
the remaining hosts. Preserve current binaries/configuration for rollback and
verify existing sessions before changing launch defaults. No rollout or upstream
issue/PR submission was performed as part of this investigation.
