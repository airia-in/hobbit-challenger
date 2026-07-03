import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyThemeMode,
  getStoredThemeMode,
  getThemeColor,
  initTheme,
  resolveTheme,
  setThemeMode,
  themeInitScript,
} from '../src/lib/theme';
import { readStorageItem, writeStorageItem } from '../src/lib/browser-storage';

describe('theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to system mode when storage is empty', () => {
    expect(getStoredThemeMode()).toBe('system');
  });

  it('persists theme mode to localStorage', () => {
    setThemeMode('light');
    expect(readStorageItem(THEME_STORAGE_KEY)).toBe('light');
    expect(getStoredThemeMode()).toBe('light');
  });

  it('applies data-theme and color-scheme for light mode', () => {
    setThemeMode('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('applies data-theme and color-scheme for dark mode', () => {
    setThemeMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('resolves system mode from prefers-color-scheme', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    writeStorageItem(THEME_STORAGE_KEY, 'system');
    applyThemeMode('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    applyThemeMode('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('updates theme when system preference changes', () => {
    const listeners = new Map<string, (event: MediaQueryListEvent) => void>();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_, handler) => {
        listeners.set(query, handler as (event: MediaQueryListEvent) => void);
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    setThemeMode('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const handler = listeners.get('(prefers-color-scheme: dark)');
    expect(handler).toBeDefined();
    handler?.({ matches: false } as MediaQueryListEvent);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('updates meta theme-color when present', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#0a0a0a');
    document.head.appendChild(meta);

    setThemeMode('light');
    expect(meta.getAttribute('content')).toBe(getThemeColor('light'));

    meta.remove();
  });

  it('initTheme applies stored preference', () => {
    writeStorageItem(THEME_STORAGE_KEY, 'dark');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolveTheme returns explicit modes unchanged', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('exports FOUC prevention script with storage key', () => {
    expect(themeInitScript).toContain(THEME_STORAGE_KEY);
    expect(themeInitScript).toContain("setAttribute('data-theme'");
  });
});
