import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  chatEfforts,
  type ChatEffort,
  type ChatProvider,
} from '../lib/chatLaunch';

const KEY = 'whip.chat-launch.v1';
export interface ChatLaunchPreferences {
  provider: ChatProvider;
  hostId: string;
  providers: Record<ChatProvider, { model: string; effort: ChatEffort }>;
}
export const defaultChatLaunchPreferences: ChatLaunchPreferences = {
  provider: 'codex',
  hostId: '',
  providers: {
    codex: { model: '', effort: 'default' },
    claude: { model: '', effort: 'default' },
  },
};

export async function loadChatLaunchPreferences(): Promise<ChatLaunchPreferences> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return defaultChatLaunchPreferences;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') return defaultChatLaunchPreferences;
  const saved = value as Partial<ChatLaunchPreferences>;
  const providers = { ...defaultChatLaunchPreferences.providers };
  for (const provider of ['codex', 'claude'] as const) {
    const options = saved.providers?.[provider];
    providers[provider] = {
      model: typeof options?.model === 'string' ? options.model : '',
      effort:
        options && chatEfforts[provider].includes(options.effort)
          ? options.effort
          : 'default',
    };
  }
  return {
    provider: saved.provider === 'claude' ? 'claude' : 'codex',
    hostId: typeof saved.hostId === 'string' ? saved.hostId : '',
    providers,
  };
}

export function saveChatLaunchPreferences(
  value: ChatLaunchPreferences,
): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(value));
}
