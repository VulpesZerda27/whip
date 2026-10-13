import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Becomes true once `enabled` holds after interactions settle and `delayMs`
 * passes, then stays true. Used to create expensive hidden views in advance.
 */
export function useIdleWarmup(enabled: boolean, delayMs: number): boolean {
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (warm || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => setWarm(true), delayMs);
    });
    return () => {
      task.cancel();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [delayMs, enabled, warm]);
  return warm;
}
