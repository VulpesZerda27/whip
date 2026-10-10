import type {
  HostRuntimeConnection,
  RuntimeAgentIntegrationStatus,
} from 'react-native-whip-ssh';
import type { ChatProvider } from '../lib/chatLaunch';

export interface ChatReadiness {
  cli: 'ready' | 'missing' | 'login-required' | 'unknown';
  version: string;
  integration: RuntimeAgentIntegrationStatus;
}

/** Static, read-only CLI probes. Authentication output never leaves the server. */
export function readinessCommand(provider: ChatProvider): string {
  const auth =
    provider === 'codex' ? 'codex login status' : 'claude auth status';
  const script = `
if ! command -v ${provider} >/dev/null 2>&1; then
  printf 'WHIP_READY:missing\\n'; exit 0
fi
probe() { if command -v timeout >/dev/null 2>&1; then timeout 8 "$@"; else "$@"; fi; }
version=$(probe ${provider} --version 2>/dev/null | head -n 1)
printf 'WHIP_VERSION:%s\\n' "$version"
probe ${auth} >/dev/null 2>&1
result=$?
case "$result" in
  0) printf 'WHIP_READY:ready\\n' ;;
  1) printf 'WHIP_READY:login-required\\n' ;;
  *) printf 'WHIP_READY:unknown\\n' ;;
esac`;
  const quoted = "'" + script.replace(/'/g, "'\\''") + "'";
  return '"${SHELL:-/bin/sh}" -lc ' + quoted;
}

export function parseReadiness(
  output: string,
  integration: RuntimeAgentIntegrationStatus,
): ChatReadiness {
  const status = output.match(
    /^WHIP_READY:(ready|missing|login-required|unknown)$/m,
  )?.[1];
  return {
    cli: (status as ChatReadiness['cli']) ?? 'unknown',
    version: output.match(/^WHIP_VERSION:(.*)$/m)?.[1]?.slice(0, 120) ?? '',
    integration,
  };
}

export async function checkChatReadiness(
  native: Pick<HostRuntimeConnection, 'execute' | 'agentIntegrationStatus'>,
  provider: ChatProvider,
): Promise<ChatReadiness> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.all([
        native.execute(readinessCommand(provider)),
        native.agentIntegrationStatus(provider),
      ]).then(([output, integration]) => parseReadiness(output, integration)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error('The server check timed out. Reconnect and retry.'),
            ),
          20000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function readinessIssues(
  readiness: ChatReadiness,
  provider: ChatProvider,
): string[] {
  const label = provider === 'codex' ? 'Codex' : 'Claude';
  const issues: string[] = [];
  if (readiness.cli === 'missing')
    issues.push(
      `${label} was not found in the server's login shell. Install it or fix its PATH in Hosts → Terminal.`,
    );
  if (readiness.cli === 'login-required')
    issues.push(
      `${label} needs a login. Run ${provider === 'codex' ? 'codex login' : 'claude auth login'} on this server, then check again.`,
    );
  if (readiness.cli === 'unknown')
    issues.push(
      `${label} login status could not be verified. Check the CLI in Terminal.`,
    );
  if (readiness.integration !== 'current')
    issues.push(
      `Chat integration: ${readiness.integration}. Repair it before starting a conversation.`,
    );
  return issues;
}
