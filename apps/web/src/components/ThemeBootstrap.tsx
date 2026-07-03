import { useEffect } from 'react';
import { clearSystemListener, initTheme } from '../lib/theme';

export function ThemeBootstrap() {
  useEffect(() => {
    initTheme();
    return () => clearSystemListener();
  }, []);

  return null;
}
