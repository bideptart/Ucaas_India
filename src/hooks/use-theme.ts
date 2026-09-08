import { useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';

const readTheme = (): AppTheme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light';

/**
 * The live light/dark state, for components that render outside `ThemeToggle`
 * (its own `theme` state is local to that one button) but still need to know
 * which theme is active — the emoji picker, for one, is a third-party
 * component with its own light/dark skin and no way to read `.dark` itself.
 *
 * `.dark` on `<html>` is the single source of truth (see ThemeToggle), so
 * this just watches that class rather than duplicating the toggle's state.
 */
export const useTheme = (): AppTheme => {
  const [theme, setTheme] = useState<AppTheme>(readTheme);

  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
};
