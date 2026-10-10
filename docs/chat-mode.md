# Whip Chat

This personal fork adds a **Chats** home screen to Whip. New installs open there;
the upstream Hosts, Herd, Terminal and More surfaces are still available.

## Daily use

1. Add your SSH servers under **Hosts**, using the same host, port, username,
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
   Whip opens that agent's native transcript and a persistent composer.
5. Tap the microphone, speak, and review the resulting text before sending.

Model and effort defaults are remembered separately for each provider. Blank
model and Default effort inherit the server's CLI settings. Model choices and
per-model effort levels are fetched from the selected server's installed CLI:
Codex uses `model/list`; Claude uses its initialization model catalog. Switching
servers/providers refreshes the list and discards late results. Selecting a model
resets effort to Default; a saved unsupported effort must be changed before launch.
These are the CLI's reported choices, not an inference-based entitlement check.
If discovery fails, Server default and manual model entry remain available.
Discovery requires Python 3 on the server, sends no prompt, suppresses auth/account
output, and stops its temporary CLI process after the bounded probe. Claude hooks
and MCP servers are disabled during discovery.

New Claude agents use `--permission-mode auto`. New Codex agents use
`--ask-for-approval on-request --sandbox workspace-write -c approvals_reviewer='"auto_review"'`.
These are automatic review modes; no bypass flag is used. Existing agents retain
their own settings. Model and effort apply at creation; use a new conversation
or the terminal's provider controls to change an existing session.

The remote server needs a compatible Herdr installation, the chosen CLI on its
login-shell PATH, and a signed-in account. The new-agent form checks CLI presence,
login status and Herdr integration. Authentication output stays on the server.
Use **Repair integration** for missing/outdated integration or **Server terminal**
for CLI installation and login. Checks detect saved authentication, not model
entitlement or subscription limits. Agents run on the server and survive leaving
the app.

## Returning to your work

**Favorite projects** restores launch settings for a new conversation. Existing
workspaces are reused when they still match the saved workspace or directory.
**Resume last chat** reconnects the saved server and opens the same running agent.
The **Open on launch** switch enables automatic resume after startup reconnection;
offline servers leave you on Chats with a manual resume option.

Unsent composer drafts are saved per server and terminal and restored after an
app restart. Saving failures are shown in chat. This is draft persistence, not a
durable send queue: pending sends are not replayed automatically after a restart.

Chats sort blocked agents first, then done agents, then working agents, then idle agents.
Unread completions and recent activity break ties within those groups.

The **Needs you** filter combines blocked agents with unread completions, which
also have a **New** badge. Opening a chat in the foreground marks its current
activity seen; responses received while the phone is locked stay unread. Tapping
a Codex or Claude notification opens that conversation in chat mode. Notification
delivery uses the existing notification settings and Android permissions.

Chat shows **Working**, **Needs you**, or **Offline** status, with **Stop** while
working and **Reconnect** when offline. Stop sends Escape to the selected agent.
The header's **Conversation options** menu contains **Read aloud** and **Open terminal**.
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
only when opened. Web links in replies open the built-in browser, including bare URLs,
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
first-run login/trust screens.

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
name **Whip Chat**. It installs beside official Whip. Android requires the same
signing identity to update an installed app, so this fork cannot replace the
official app or read its private settings/credentials. This upstream version
does not offer a portable settings export. Add servers and credentials once
in the fork; keep the official app installed until the new setup works.

Subsequent APKs with this application ID and the same private signing key can
update Whip Chat in place and preserve its settings. Do not uninstall it to
update. Keep a private backup of your signing keystore and its passwords.
Do not commit signing files or SSH credentials. Update checks point to this
fork's GitHub releases, not upstream's incompatible APKs.

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

The signed, bundled release APK is `artifacts/whip-chat-arm64.apk`. It needs no
Metro server. The helper skips R8 optimization to keep personal builds faster.
It packages compressed native libraries for extraction during installation,
which also allows ARM translation on compatible x86 Android emulators.
The signing key is private and is never included in the APK or repository.

## Validation

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
