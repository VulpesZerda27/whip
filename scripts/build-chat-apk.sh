#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/27.1.12297006}"
export PATH="$HOME/.cargo/bin:$PATH"
if [[ -z "${JAVA_HOME:-}" ]] && command -v mise >/dev/null 2>&1; then
  JAVA_HOME="$(mise where java)"
  export JAVA_HOME
fi
export WHIP_UPLOAD_KEYSTORE_PROPERTIES="${WHIP_UPLOAD_KEYSTORE_PROPERTIES:-$HOME/.config/whip-chat/upload-keystore.properties}"
if [[ ! -f "$WHIP_UPLOAD_KEYSTORE_PROPERTIES" ]]; then
  echo 'Missing personal signing properties; see docs/chat-mode.md.' >&2
  exit 1
fi

ndk_bin="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$ndk_bin/aarch64-linux-android24-clang"
export CC_aarch64_linux_android="$ndk_bin/aarch64-linux-android24-clang"
export AR_aarch64_linux_android="$ndk_bin/llvm-ar"
export NODE_ENV=production

node scripts/generate-reins-assets.mjs
android/gradlew -p android app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a -Pwhip.skipR8=true \
  -Pexpo.useLegacyPackaging=true \
  --no-daemon --max-workers=4 "$@"
mkdir -p artifacts
cp android/app/build/outputs/apk/release/app-release.apk artifacts/reins-arm64.apk
sha256sum artifacts/reins-arm64.apk > artifacts/reins-arm64.apk.sha256
echo "APK: $repo_dir/artifacts/reins-arm64.apk"
