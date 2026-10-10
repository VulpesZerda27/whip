import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyChatLibrary,
  loadChatLibrary,
  saveChatLibrary,
  type ChatLibrary,
} from '../services/chatLibrary';
import { reportBackgroundFailure } from '../services/backgroundOperations';

export function useChatLibrary() {
  const [value, setValue] = useState(emptyChatLibrary);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(value);
  const ready = useRef(false);
  useEffect(() => {
    let cancelled = false;
    loadChatLibrary()
      .then(saved => {
        if (cancelled) return;
        current.current = saved;
        setValue(saved);
      })
      .catch(reason => {
        if (!cancelled)
          setError(`Could not load saved chats: ${String(reason)}`);
      })
      .finally(() => {
        if (!cancelled) {
          ready.current = true;
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const update = useCallback(
    (change: (previous: ChatLibrary) => ChatLibrary) => {
      if (!ready.current) return;
      const next = change(current.current);
      if (next === current.current) return;
      current.current = next;
      setValue(next);
      reportBackgroundFailure(
        saveChatLibrary(next).catch(reason => {
          setError(`Could not save chat settings: ${String(reason)}`);
        }),
        'chat-library-save',
      );
    },
    [],
  );
  return { value, loaded, error, update };
}
export type ChatLibraryController = ReturnType<typeof useChatLibrary>;
