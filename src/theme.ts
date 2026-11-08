import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rooost.theme';
const GROUND: Record<Theme, string> = { light: '#f3f3f6', dark: '#0a0a0b' };

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', GROUND[theme]);
}

/** The first paint is themed by the inline script in index.html. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (storedTheme()) return;
      const next: Theme = system.matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    };
    system.addEventListener('change', onChange);
    return () => system.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The switch still works for this visit when storage is blocked.
    }

    const swap = () => {
      applyTheme(next);
      flushSync(() => setTheme(next));
    };
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof document.startViewTransition === 'function' && !calm) {
      document.startViewTransition(swap);
    } else {
      swap();
    }
  }, [theme]);

  return { theme, toggleTheme };
}
