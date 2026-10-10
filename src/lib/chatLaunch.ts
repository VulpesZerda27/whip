import type { TabLaunchIntent } from './herdrCreationFlows';

export type ChatProvider = 'codex' | 'claude';
export type ChatEffort =
  'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
export interface ChatLaunchOptions {
  provider: ChatProvider;
  model: string;
  effort: ChatEffort;
}

export const chatEfforts: Record<ChatProvider, readonly ChatEffort[]> = {
  codex: ['default', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['default', 'low', 'medium', 'high', 'xhigh', 'max'],
};

// Suggestions are editable: the remote CLI/account is authoritative for availability.
export const chatModels: Record<ChatProvider, readonly string[]> = {
  codex: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'],
  claude: ['opus', 'sonnet', 'haiku'],
};

/** Arguments stay structured all the way to Rust's managed-agent launcher. */
export function chatLaunchIntent(options: ChatLaunchOptions): TabLaunchIntent {
  const { provider, effort } = options;
  const model = options.model.trim();
  // Model IDs cannot contain ASCII control characters.
  // eslint-disable-next-line no-control-regex
  if (model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) {
    throw new Error(
      'Enter a model name without line breaks or control characters.',
    );
  }
  if (!chatEfforts[provider].includes(effort)) {
    throw new Error(`Unsupported ${provider} effort: ${effort}`);
  }
  const args =
    provider === 'claude'
      ? ['--permission-mode', 'auto']
      : [
          '--ask-for-approval',
          'on-request',
          '--sandbox',
          'workspace-write',
          '-c',
          'approvals_reviewer="auto_review"',
        ];
  if (model) args.push('--model', model);
  if (effort !== 'default') {
    if (provider === 'claude') args.push('--effort', effort);
    else args.push('-c', `model_reasoning_effort="${effort}"`);
  }
  return { type: 'agent', kind: provider, args, reverseControl: false };
}

export function isChatProvider(
  value: string | undefined,
): value is ChatProvider {
  return value === 'codex' || value === 'claude';
}
