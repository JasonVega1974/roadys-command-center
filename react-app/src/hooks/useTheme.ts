import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type Theme = 'dark' | 'day';

const STORAGE_KEY = 'roadys_theme';

/**
 * Legacy app toggled `document.body.classList` between default (dark) and
 * `day-mode` (light). Keeping the same class keeps the existing CSS tokens
 * working without changes.
 */
export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>(STORAGE_KEY, 'dark');

  useEffect(() => {
    document.body.classList.toggle('day-mode', theme === 'day');
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'day' : 'dark'));

  return { theme, setTheme, toggle };
}
