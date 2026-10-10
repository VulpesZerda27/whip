import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatLaunchOptions } from '../lib/chatLaunch';
import { chatEfforts, isChatProvider } from '../lib/chatLaunch';

const KEY = 'whip.chat-library.v1';
export interface ChatFavorite extends ChatLaunchOptions {
  id: string;
  label: string;
  hostId: string;
  directory: string;
  workspaceId: string;
}
export interface RecentChat {
  hostId: string;
  paneId: string;
  label: string;
}
export interface ChatActivity {
  fingerprint: string;
  seen: string;
  updatedAt: number;
}
export interface ChatLibrary {
  favorites: ChatFavorite[];
  lastChat: RecentChat | null;
  resumeOnLaunch: boolean;
  activity: Record<string, ChatActivity>;
}
export const emptyChatLibrary: ChatLibrary = {
  favorites: [],
  lastChat: null,
  resumeOnLaunch: true,
  activity: {},
};
export const chatKey = (hostId: string, paneId: string) =>
  JSON.stringify([hostId, paneId]);

export function parseChatLibrary(raw: string | null): ChatLibrary {
  if (!raw) return { ...emptyChatLibrary };
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return { ...emptyChatLibrary };
  const value = parsed as Partial<ChatLibrary>;
  const favorites = Array.isArray(value.favorites)
    ? value.favorites
        .filter(
          (item: ChatFavorite) =>
            item &&
            isChatProvider(item.provider) &&
            chatEfforts[item.provider].includes(item.effort) &&
            [
              'id',
              'label',
              'hostId',
              'directory',
              'workspaceId',
              'model',
            ].every(key => typeof item[key as keyof ChatFavorite] === 'string'),
        )
        .slice(0, 30)
    : [];
  const recent = value.lastChat;
  const lastChat =
    recent &&
    ['hostId', 'paneId', 'label'].every(
      key => typeof recent[key as keyof RecentChat] === 'string',
    )
      ? { hostId: recent.hostId, paneId: recent.paneId, label: recent.label }
      : null;
  const activity = Object.fromEntries(
    Object.entries(value.activity ?? {})
      .filter(([, item]) => {
        const entry = item as ChatActivity | null;
        return (
          entry &&
          typeof entry.fingerprint === 'string' &&
          typeof entry.seen === 'string' &&
          Number.isFinite(entry.updatedAt)
        );
      })
      .slice(-300),
  ) as Record<string, ChatActivity>;
  return {
    favorites,
    lastChat,
    activity,
    resumeOnLaunch: value.resumeOnLaunch !== false,
  };
}
export async function loadChatLibrary(): Promise<ChatLibrary> {
  return parseChatLibrary(await AsyncStorage.getItem(KEY));
}
let writes: Promise<void> = Promise.resolve();
export function saveChatLibrary(value: ChatLibrary): Promise<void> {
  const json = JSON.stringify(value);
  const next = Promise.allSettled([writes]).then(() =>
    AsyncStorage.setItem(KEY, json),
  );
  writes = next;
  return next;
}
