# Reins

Reins (formerly Whip Chat) is an independent fork of Whip, modified in October
2026 and licensed under AGPL-3.0-or-later. Original credits and license notices
remain available in Settings → About → Open-source licenses. Reins focuses on
**Chats**, **Servers**, and **Settings**. Terminal access is a secondary action
on each saved server and within conversations.

## Daily use

1. Add your SSH servers under **Servers**, using the same host, port, username,
   key/password and Herdr session name as official Whip. Tailscale on the phone
   must be connected if you use Tailnet addresses.
2. Open **Chats** and connect the servers you want to use. Chats merges existing
   Codex and Claude agents across those connections; the server chips filter it.
3. Tap **+**. Choose the server, provider, model and effort. Choose an existing
   Herdr workspace or pick Home (`~`), `~/Projects`, or a project folder fetched
   from that server. The Projects choices appear only when the folder exists.
   You can search long project lists or enter an absolute directory manually.
4. Save a favorite project to reuse that server, directory, provider, model and
   effort. Start the conversation after the server readiness check passes.
   Reins opens that agent's native transcript and a persistent composer.
5. Tap the microphone, speak, and review the resulting text before sending.

Model and effort defaults are remembered separately for each provider. Blank
model and Default effort inherit the server's CLI settings. Model choices and
per-model effort levels are fetched from the selected server's installed CLI:
Codex uses the shared daemon’s `model/list`; Claude uses its initialization model catalog. Switching
servers/providers refreshes the list and discards late results. Selecting a model
resets effort to Default; a saved unsupported effort must be changed before launch.
These are the CLI's reported choices, not an inference-based entitlement check.
If discovery fails, Server default and manual model entry remain available.
Claude discovery requires Python 3, sends no prompt, suppresses auth/account output,
and stops its temporary CLI process after the bounded probe. Claude hooks and MCP
servers are disabled during discovery. Codex discovery uses the existing daemon
connection and does not launch a model probe or require Python.

New Claude agents use `--permission-mode auto`. New Codex chats use the daemon API with
`approvalPolicy: on-request`, `sandbox: workspace-write`, and `approvalsReviewer: auto_review`.
These are automatic review modes; no bypass flag is used. Existing agents retain
their own settings. Codex’s model/effort button also changes the next turn in an existing conversation;
guidance sent during an active turn uses that turn’s settings. Claude’s existing
terminal controls remain available for changing an existing session.

The remote server needs a compatible Herdr installation, the chosen CLI on its
login-shell PATH, and a signed-in account. The new-agent form checks CLI presence,
login status and (for Claude) Herdr integration. Codex chat needs a CLI that
supports `app-server proxy` and the shared-daemon API. Authentication output stays
on the server.
Use **Repair integration** for missing/outdated integration or **Server terminal**
for CLI installation and login. Checks detect saved authentication, not model
entitlement or subscription limits. Agents run on the server and survive leaving
the app.

## Codex shared daemon

As of 1.8.11, Chats discovers Codex conversations from each server’s shared daemon
and uses its actual thread IDs. Conversation titles, directories, terminal pane
IDs, and inherited hook environment variables are not identity fallbacks. This
also lists persisted conversations without a currently open desktop terminal.
Claude continues using its existing Herdr integration and transcript backend.

Whip connects through an exec channel on the existing authenticated SSH connection
using `codex app-server proxy`. Nothing is exposed on a public port; no separate
API key, Codex fork, server configuration rewrite, daemon restart, or agent restart
is required. If there is no daemon, the official idempotent `daemon start` starts it.

Selecting a chat explicitly resumes/subscribes to that exact thread and loads its
full history. Merely listing chats does not resume them. Whip reconciles the initial
snapshot against the native event cursor, replaces streaming text with completed
items, and refreshes full history after a connection change or event-buffer overflow.
Turn completion summaries merge items by ID without removing user messages, tools,
or intermediate replies. Only an explicitly full turn snapshot replaces its item
list; partial and older unmarked notifications preserve the accumulated history.
The displayed chat stays tied to its thread even if a desktop terminal switches to
another conversation. This does not repair upstream Herdr’s terminal-pane mapping;
the optional Herdr terminal view still has that upstream limitation.

New Codex chats run without creating a terminal pane. **Open terminal** explicitly
creates a terminal resuming the same thread. Chat supports text, image/file
attachments, dictation, stop, guidance during work, model/effort selection, read
aloud, file previews, and web links. Command/file approvals, permission requests,
agent questions, and MCP form/website requests have structured controls. Unknown
future request types retain a Terminal escape hatch. Responses carry the original
connection and request ID; another client resolving a request removes it here.

Drafts are preserved on send failure. Delivery can be uncertain after a timeout,
so Whip never automatically resends a mutation. Reconnect reloads the conversation
for inspection before a manual retry. Existing settings, SSH keys, favorites and
Claude drafts survive an APK update. Legacy Codex drafts tied to unreliable pane
IDs remain in their existing storage; they are not guessed onto a daemon thread.
Historical conversations are initially treated as read. New completions become
unread and use the existing blocked → done → working → idle ordering.

Native activity callbacks keep daemon updates flowing when Android pauses JavaScript
timers. Codex alerts use thread IDs and the existing notification preferences;
tapping an alert opens that thread. As with existing Whip alerts, delivery depends
on the app’s background service, SSH reachability and Android notification policy.

## Returning to your work

**Favorite projects** restores launch settings for a new conversation. Existing
workspaces are reused when they still match the saved workspace or directory.
The app opens the Chats list without automatically selecting a conversation.
Tap a chat to open it; selecting an offline chat reconnects its saved server.

Unsent composer drafts are saved per server and conversation (Codex thread ID or
Claude terminal ID) and restored after an
app restart. Saving failures are shown in chat. This is draft persistence, not a
durable send queue: pending sends are not replayed automatically after a restart.

Chats sort blocked agents first, then done agents, then working agents, then idle agents.
Unread completions and recent activity break ties within those groups.

The **Needs you** filter combines blocked agents with unread completions, which
also have a **New** badge. Opening a chat in the foreground marks its current
activity seen; responses received while the phone is locked stay unread. Tapping
a Codex or Claude notification opens that conversation in chat mode. Notification
delivery uses the existing notification settings and Android permissions.

On startup, Chats keeps existing rows visible and shows **Syncing chats…** while
saved servers reconnect. Manage connections in **Servers**; Chats only shows a
connection problem when loading or automatic retries have actually failed.

Codex completion badges also follow Herdr's seen state on other terminals. Reins
confirms the receipt against fresh server snapshots and the exact conversation
ID, then clears **Done / New** within a few seconds while the app is open. Cached
offline snapshots, blocked requests and newer completions cannot reuse an old
receipt. This requires Herdr's Codex integration to have registered the session
ID; older unlinked terminals and sessions already closed while Reins was offline
cannot supply a read receipt. Opening those conversations in Reins clears them
locally. No Codex modification or title/directory matching is involved.

Chat shows **Working**, **Needs you**, or **Offline** status, with **Stop** while
working and **Reconnect** when offline. Stop interrupts the exact Codex turn;
Claude retains its existing Escape-based control.
Claude’s **Conversation options** menu contains **Read aloud** and **Open terminal**;
Codex exposes those controls in its header.
Chat preserves the desktop terminal's width, including when sending messages,
attachments, or approval answers. It uses the host's control and transcript
connections without attaching a phone-sized terminal. **Open terminal** attaches
at the phone's dimensions; returning to Chat releases that attachment so the
desktop can use its own dimensions again.
Simple chat has no back arrow or terminal shortcut bar; use the system back gesture.
A single input row grows as you type, with attachment, voice and send controls.
Its opaque background extends through the bottom gesture area so scrolled messages
cannot peek out underneath. Chat keeps the system status bar beside the camera
cutout, with the title below the top safe area, even with fullscreen terminals enabled.
Prompt timestamps and response duration/copy footers are hidden; text remains selectable.

Tap a filename or path in a reply to open it on that conversation's server.
Plain filenames and inline code paths are linked automatically; relative paths
use the conversation's working directory. Read/write tool cards also have tappable
filenames. PNGs and other supported images open in the zoomable image viewer;
documents use the existing file previews. Local Markdown images become preview
links instead of trying to load server paths from the phone. Files are fetched
only when opened. Web links in replies open the phone’s browser, including bare URLs,
Markdown links, standalone URLs in backticks, and URLs on web tool cards.
Fenced code and shell commands retain their original formatting.

Android PNG, JPEG and WebP file previews load tiles from the original downloaded
file as you zoom, preserving full pixel detail without decoding a huge image all
at once. **1:1** shows one original image pixel per physical screen pixel;
**Fit** restores the overview. The viewer shows the original pixel dimensions,
supports pinch/pan and double-tap, and can zoom beyond 1:1. Other formats and iOS
keep their existing viewer. The existing 20 MB remote image download limit applies.

Live questions and approval menus appear below the latest response. Choose an
option, then confirm it. Controls are bound to the current terminal and prompt;
the native runtime checks the live prompt again before sending an answer. Prompt
polling pauses in the background. Free-text and manual controls remain available
for dialogs that need them, with a terminal fallback for unsupported prompts or
first-run login screens.

Claude's folder-trust question also appears in chat before a conversation ID is
available. The folder and access scope remain visible; select an option and
explicitly confirm it. The native runtime rechecks the current terminal, live
prompt and connection before responding. It does not accept trust automatically.
Claude intentionally asks again for each new session in the home directory;
see [workspace trust](https://code.claude.com/docs/en/permissions#project-allow-rules-and-workspace-trust).
After startup, a new Claude session opens as an empty usable chat even before
its first transcript file exists. Reins waits for that exact session's file and
loads it when Claude writes the first message.

## Voice

Android dictation opens the installed speech recognition service's recording
screen and returns text to the current draft. It does not automatically send
messages or save audio files. Cancellation leaves the draft intact. A result
for a closed composer or different conversation is discarded. Recognition may
use the speech service's network processing, according to its settings.
If no speech service is installed, use the keyboard microphone or install one.
The dedicated button is Android-only; iOS retains keyboard dictation.

## Installation and settings

The Android application ID is `io.github.vulpeszerda27.whipchat`, with launcher
name **Reins** (formerly **Whip Chat**). It installs beside official Whip. Android requires the same
signing identity to update an installed app, so this fork cannot replace the
official app or read its private settings/credentials. This upstream version
does not offer a portable settings export. Add servers and credentials once
in the fork; keep the official app installed until the new setup works.

Subsequent APKs with this application ID and the same private signing key can
update Reins or an existing Whip Chat installation in place and preserve its settings. Do not uninstall it to
update. Keep a private backup of your signing keystore and its passwords.
Do not commit signing files or SSH credentials. Update checks point to this
fork's GitHub releases, not upstream's incompatible APKs.

## Branding

The original standard, dark and tinted icons are in `assets/reins/`. Run
`npm run generate:android-icon` to regenerate Android adaptive, legacy, themed
and notification icons, the iOS icon artwork, and the in-app installation QR.
The release build runs this step automatically. Launcher labels, in-app copy and
permissions use Reins; package IDs, native module names, storage keys and the
private signing identity remain stable so the existing installation updates
without losing servers, settings or credentials. Source and installation links
point to this fork, while Whip remains credited as the upstream project.

## Build on Linux

Follow the toolchain requirements in CONTRIBUTING.md. Install npm dependencies,
Rust 1.99.0 and its `aarch64-linux-android` target, Android SDK 36, NDK
27.1.12297006, CMake 3.22.1, and a JDK. The helper uses `JAVA_HOME` or the Java
installation managed by mise, and defaults `ANDROID_HOME` to `~/Android/Sdk`.

Create a private release keystore using `keytool -genkeypair`. Store its
properties in `~/.config/whip-chat/upload-keystore.properties`, mode 600:

```properties
storeFile=/absolute/path/to/private/release.jks
storePassword=your-private-password
keyAlias=whip-chat
keyPassword=your-private-password
```

Then run:

```sh
npm ci
rustup target add --toolchain 1.99.0 aarch64-linux-android
bash scripts/build-chat-apk.sh
```

The signed, bundled release APK is `artifacts/reins-arm64.apk`. It needs no
Metro server. The helper skips R8 optimization to keep personal builds faster.
It packages compressed native libraries for extraction during installation,
which also allows ARM translation on compatible x86 Android emulators.
The signing key is private and is never included in the APK or repository.

## Validation

Version 1.8.16 opens newly launched Claude agents in Chat, treats a confirmed
blocked startup as a question, and handles its workspace-trust screen inline.
A new session with no transcript file opens an empty usable chat while the exact
file is discovered. The installed Claude 2.1.285 trust screen was reproduced in
an isolated Herdr session and captured as a sanitized regression fixture.
All 2,056 JavaScript tests, 604 Rust tests, TypeScript, Clippy, app-version and
license checks pass. Coverage includes changing sessions/connections, preserving
an explicit Terminal choice, avoiding duplicate launches, and the first real
message replacing the empty startup state.

Version 1.8.15 makes expected connection startup a neutral syncing state, removes
redundant Connect rows from Chats, and syncs Codex read state from freshly
confirmed, exactly linked Herdr terminals. Unlinked older terminals require
opening the conversation once in Reins, as described above.

Version 1.8.14 removes the separate Herd dashboard, memberships/purchases, usage
statistics, feedback worker, embedded browser and phone-control/Shizuku features.
It removes purchase, location and privileged-access permissions from Android.
The client still includes terminal and remote file/preview support; its shared
native Herdr library retains protocol APIs used by other upstream clients.
Settings focuses on notifications, SSH security, language/theme and basic terminal
preferences. Old Herd navigation migrates to Chats and automatic terminal reopening
is disabled. Existing credentials, server profiles, drafts, favorites and provider
settings keep their original storage and Android application identity.

The checks below for earlier releases describe their behavior at that time.


Version 1.8.13 renames this fork to Reins and applies the supplied standard, dark
and tinted artwork to the app and Android launcher. The application ID and signing
configuration are unchanged. About and license screens identify the Whip origin,
modification date and AGPL license, with source and installation links for this
fork. TypeScript, all 2,322 JavaScript tests, full ESLint, app-version and
bundled-license checks pass. The signed ARM64 APK reports Reins 1.8.13 (version
code 239), with the same package and certificate as Whip Chat 1.8.12. An Android
emulator upgrade retained a saved notification preference; launcher and About
screens show the new name and artwork. The QR extracted from the final APK decodes
to this fork's installation guide. Android bundle inputs now include artwork so
image-only changes cannot silently leave stale assets in an incremental build.

Version 1.8.12 fixes live Codex turns losing user messages and intermediate steps
when a completion notification contains only a final-answer summary. All 206 Jest
suites (2,322 tests), TypeScript, full ESLint and app-version checks pass. Regression
coverage includes messages from another client, steering, tool steps, repeated
summaries, empty partial notifications, older unmarked notifications, and full
history replacement.
The opt-in live daemon test verifies a second client's user message remains visible
after completion without reloading, then compares the live turn's messages with
fresh history after reconnecting. The ARM64 release build passes; APK inspection
confirms version code 238 and the same application ID and signing certificate as
1.8.11, allowing an update that retains app data.

Version 1.8.11 passes 206 Jest suites (2,314 tests), 597 Rust unit tests, TypeScript,
full ESLint, Clippy, app-version and license checks. Native SSH/WebSocket reads succeeded
on workstation, Prohosting24, Pangolin and Heast with their existing official Codex
installations. Isolated conversations verify send, a second client’s final reply,
steer/interrupt and reconnect without duplicated output. Unit/UI coverage includes
snapshot/event reconciliation, pagination, stale connections, uncertain sends,
approval identity, typed questions/forms, draft preservation, unread baselines,
notification routing and Claude provider isolation. Android emulator checks include
upgrading the existing package while retaining its saved host, opening the formerly
broken “Fix clipboard paste” conversation, opening a live Claude conversation,
restoring a Codex draft after an APK upgrade, sending from the Android composer
with the keyboard visible, and receiving a completion notification carrying the
exact thread ID while the app is in the background.
Physical-phone microphone, audio playback and OS background suspension still need
device validation; no iOS native build was performed on Linux.

Version 1.8.10 removes Resume last chat and Open on launch, including startup
behavior and stored-preference handling. All 202 Jest suites (2,292 tests),
TypeScript, changed-file ESLint, the app-version check and the signed ARM64
release build pass. Regression tests verify that old enabled resume settings
cannot open a conversation at startup or on foregrounding, while explicit chat
selection and offline reconnection still work. The release installs over 1.8.9
on the Android emulator, opens without runtime errors, and shows the Chats list
without either resume control after relaunch. The emulator had no saved servers;
saved-preference migration is covered by the regression tests.

The shared Codex daemon association issue was investigated separately; see
[the findings and proposed design](codex-shared-daemon-investigation.md).
No daemon integration changes are included in 1.8.10.

Version 1.8.9 passes all 202 Jest suites (2,292 tests), TypeScript, changed-file
ESLint, the app-version check and the signed ARM64 release build. An Android
instrumentation test opens a 12,000 × 512 PNG containing one-pixel stripes,
checks that Fit uses reduced overview tiles, then verifies the rendered pixels
exactly at 1:1 and returns to Fit. It also checks original dimensions and a
1,024-pixel bound on decoded tile edges. The release installs over 1.8.8.

Version 1.8.8 passes all 201 Jest suites (2,289 tests), TypeScript, full ESLint,
the app-version check, and the iOS JavaScript bundle build. Regression tests cover
Chat without a terminal attachment, messages and attachments, raw keys with
tracing enabled, disconnected renderer status, host reconnection, live approval
controls, background/resume, delayed attachment release, evicted bridges, and
switching back to Terminal with the latest phone geometry. The signed ARM64 APK
builds and verifies, installs over the emulator's existing app, and launches
without JavaScript errors. This emulator has no saved SSH host; live desktop
width transitions and the physical-phone update have not been verified there.

Version 1.8.7 passes all 201 Jest suites (2,274 tests) for file taps, followed by
152 focused file/link tests after adding inline-code web URLs and web tool taps.
TypeScript, changed-file ESLint and the app-version check pass. The signed ARM64
release builds and its signature verifies. Installation over 1.8.6 preserves
the emulator's saved SSH server and credentials. Tapping a PNG Read card in a
live Claude conversation opens the actual remote image; double-tap zoom works.
A source link in a live Claude reply also opens its website in the built-in browser.

Version 1.8.6 passes 167 focused tests across chat ordering, navigation, session
opening, composer behavior and keyboard layout, plus TypeScript, changed-file
ESLint and the app-version check. The signed release was installed over 1.8.5 on
the Android 16 emulator; its saved server and credentials survived. Live chat was
checked with a simulated camera cutout, scrolled history, and the keyboard both
open and closed. The title remains below the cutout and the composer covers the
bottom gesture area.

Version 1.8.5 passes all 200 Jest suites (2,246 tests), TypeScript, ESLint,
597 Rust tests, strict Rust Clippy, and the repository's app-version check.
The previous release also passed Expo Doctor's 20 checks. The
signed ARM64 release builds successfully and its signature verifies. Regression
tests cover reconnecting the exact saved conversation, ignoring stale navigation,
unread activity while locked, prompt polling on foreground transitions, favorites,
draft restoration and write ordering, launch readiness, and live question controls.
Readiness tests execute the actual generated shell probe with test CLIs and verify
that authentication output does not escape.

Version 1.8.5 was installed over 1.8.4 on the Android 16 emulator with ARM
translation; its server credentials and favorite survived. A live workstation
Claude conversation verifies the compact chat layout, keyboard positioning,
system back gesture and continued transcript updates. Model/effort discovery
was exercised against the workstation's real Codex and Claude CLIs, plus fake
CLIs that check protocol-only requests, pagination and secret suppression.
Folder tests cover home, absent/inaccessible Projects, and sorted directories.

A Claude transcript bug could let a stale `last-prompt` branch marker hide a
later final reply until another prompt arrived. Branch stamps now expire when
newer conversation records arrive; the cache version forces old projections to
reload. Whole-file, incremental and cache-resume tests cover the fix, and the
previously affected local transcript prefix now includes its complete final reply.
Private transcript contents are not included in fixtures or commits.

Microphone recognition and Wi-Fi/cellular handoff still need physical-phone testing.
iOS native builds were not run on this Linux workstation; the dedicated dictation
module targets Android.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing),
[Codex sandbox and review](https://learn.chatgpt.com/docs/sandboxing),
[Claude CLI](https://code.claude.com/docs/en/cli-reference),
[Codex model discovery](https://learn.chatgpt.com/docs/app-server#list-models-model-list),
[Claude initialization protocol](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py).
