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
4. Start the conversation. Whip opens that agent's native transcript and a
   persistent composer. A small toolbar includes Escape to interrupt, search and
   the terminal fallback for first-run login/trust prompts or unsupported dialogs.
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
launch PATH, and a signed-in account. Chat transcripts use Whip's existing
Herdr agent integration. If prompted to install/repair that integration, follow
the existing setup sheet and restart the agent. CLI login/trust prompts remain
available through the terminal fallback. Agents run on the server and survive
leaving the app.

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

The Android implementation passes all 195 Jest suites (2,217 tests), TypeScript,
ESLint, Expo Doctor's 20 checks, and the repository's app-version check. The
signed ARM64 release builds successfully and its signature verifies. A regression
test also covers retrying a failed agent launch before a new workspace's snapshot
arrives.

The release APK was smoke-tested on an Android 16 emulator with ARM translation:
the Chats home and both provider forms render and respond to navigation. A saved
test server and its connection details survived installing the rebuilt APK over
the previous signed build. Live server conversations and microphone recognition still need testing on a phone
with the user's servers and speech service. iOS native builds were not run on
this Linux workstation; the dedicated dictation module targets Android.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing),
[Codex sandbox and review](https://learn.chatgpt.com/docs/sandboxing),
[Claude CLI](https://code.claude.com/docs/en/cli-reference).
