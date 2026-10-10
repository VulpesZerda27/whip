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
   Herdr workspace or enter an absolute project directory for a new workspace.
4. Save a favorite project to reuse that server, directory, provider, model and
   effort. Start the conversation after the server readiness check passes.
   Whip opens that agent's native transcript and a persistent composer.
5. Tap the microphone, speak, and review the resulting text before sending.

Model and effort defaults are remembered separately for each provider. Blank
model and Default effort inherit the server's CLI settings. Suggested models
are shortcuts, not an account availability check; you can type any supported
model ID. Effort availability varies by model and CLI version.

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

The **Needs you** filter combines blocked agents with unread completions, which
also have a **New** badge. Opening a chat in the foreground marks its current
activity seen; responses received while the phone is locked stay unread. Tapping
a Codex or Claude notification opens that conversation in chat mode. Notification
delivery uses the existing notification settings and Android permissions.

Chat shows **Working**, **Needs you**, or **Offline** status, with **Stop** while
working and **Reconnect** when offline. Stop sends Escape to the selected agent.
The **Read aloud** switch changes the existing speech preference from inside chat.

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

The Android implementation passes all 198 Jest suites (2,237 tests), TypeScript,
ESLint, Expo Doctor's 20 checks, and the repository's app-version check. The
signed ARM64 release builds successfully and its signature verifies. Regression
tests cover reconnecting the exact saved conversation, ignoring stale navigation,
unread activity while locked, prompt polling on foreground transitions, favorites,
draft restoration and write ordering, launch readiness, and live question controls.
Readiness tests execute the actual generated shell probe with test CLIs and verify
that authentication output does not escape.

The release APK was smoke-tested on an Android 16 emulator with ARM translation:
the Chats home and both provider forms render and respond to navigation. A saved
test server and its connection details survived updating from 1.8.3 to 1.8.4.
A saved favorite and server also survived emulator network toggles, locking and
unlocking, and a force-stop/relaunch. These checks used an offline test profile.
Live conversations across Wi-Fi/cellular handoff and microphone recognition still
need testing on a physical phone with the user's servers and speech service.
iOS native builds were not run on this Linux workstation; the dedicated dictation
module targets Android.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing),
[Codex sandbox and review](https://learn.chatgpt.com/docs/sandboxing),
[Claude CLI](https://code.claude.com/docs/en/cli-reference).
