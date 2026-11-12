import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
function initial(): Theme {
  try {
    const s = localStorage.getItem('theme');
    if (s === 'light' || s === 'dark') return s;
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return { theme, toggle: useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []) };
}
