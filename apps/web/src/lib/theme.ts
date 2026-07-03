import { readStorageItem, writeStorageItem } from './browser-storage';
import { syncNativeStatusBar } from './sync-native-status-bar';

export const THEME_STORAGE_KEY = 'hobbit-theme-mode';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#0a0a0a',
  light: '#f7f5f2',
};

let systemMediaQuery: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getStoredThemeMode(): ThemeMode {
  const stored = readStorageItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : 'system';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function getThemeColor(
  resolved: ResolvedTheme = resolveTheme(getStoredThemeMode()),
): string {
  return THEME_COLORS[resolved];
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[resolved]);
  }

  void syncNativeStatusBar(resolved);
}

export function clearSystemListener(): void {
  if (systemMediaQuery && systemListener) {
    systemMediaQuery.removeEventListener('change', systemListener);
  }
  systemMediaQuery = null;
  systemListener = null;
}

function setupSystemListener(mode: ThemeMode): void {
  clearSystemListener();
  if (mode !== 'system' || typeof window === 'undefined') return;

  systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemListener = (event: MediaQueryListEvent) => {
    applyResolvedTheme(event.matches ? 'dark' : 'light');
  };
  systemMediaQuery.addEventListener('change', systemListener);
}

export function applyThemeMode(mode: ThemeMode): void {
  applyResolvedTheme(resolveTheme(mode));
  setupSystemListener(mode);
}

export function setThemeMode(mode: ThemeMode): void {
  writeStorageItem(THEME_STORAGE_KEY, mode);
  applyThemeMode(mode);
}

export function initTheme(): void {
  applyThemeMode(getStoredThemeMode());
}

/** Self-contained script for BaseLayout `<head>` — prevents theme FOUC. */
export const themeInitScript = `(function(){var k='${THEME_STORAGE_KEY}';var m='system';try{var s=localStorage.getItem(k);m=s==='light'||s==='dark'||s==='system'?s:'system';}catch(x){}var e=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.setAttribute('data-theme',e);document.documentElement.style.colorScheme=e;var c=e==='light'?'#f7f5f2':'#0a0a0a';var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',c);})();`;
