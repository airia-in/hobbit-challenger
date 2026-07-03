import { useEffect } from 'react';
import { initTheme } from '../lib/theme';

export function ThemeBootstrap() {
  useEffect(() => {
    initTheme();
  }, []);

  return null;
}
