import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useAppForeground(): boolean {
  const [foreground, setForeground] = useState(
    () => !AppState?.currentState || AppState.currentState === 'active',
  );
  useEffect(() => {
    const subscription = AppState?.addEventListener('change', state =>
      setForeground(state === 'active'),
    );
    return () => subscription?.remove();
  }, []);
  return foreground;
}
