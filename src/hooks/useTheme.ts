import { useCallback, useSyncExternalStore } from 'react';
import {
  readThemeChoice,
  resolveTheme,
  setThemeChoice,
  subscribeTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from '../lib/theme';

/** Tema de la app: elección del usuario (light | dark | system) y tema real aplicado. */
export function useTheme() {
  const choice = useSyncExternalStore<ThemeChoice>(subscribeTheme, readThemeChoice, () => 'system');
  const resolved = useSyncExternalStore<ResolvedTheme>(
    subscribeTheme,
    () => resolveTheme(readThemeChoice()),
    () => 'light',
  );

  const toggleTheme = useCallback(() => {
    setThemeChoice(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved]);

  return { choice, resolved, setChoice: setThemeChoice, toggleTheme };
}
