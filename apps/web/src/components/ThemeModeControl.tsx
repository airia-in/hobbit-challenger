import { useState } from 'react';
import { getStoredThemeMode, setThemeMode, type ThemeMode } from '../lib/theme';

const THEME_MODES = ['light', 'dark', 'system'] as const;

type ThemeModeControlProps = {
  compact?: boolean;
};

export function ThemeModeControl({ compact = false }: ThemeModeControlProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' ? getStoredThemeMode() : 'system',
  );

  function handleThemeModeChange(mode: ThemeMode) {
    setThemeModeState(mode);
    setThemeMode(mode);
  }

  if (compact) {
    return (
      <div className="flex gap-1.5" role="radiogroup" aria-label="Theme">
        {THEME_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={themeMode === mode}
            onClick={() => handleThemeModeChange(mode)}
            className={`rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
              themeMode === mode
                ? 'border-[var(--accent-red)] bg-[var(--accent-red)] text-[var(--text-on-accent)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
            }`}
          >
            {mode === 'system'
              ? 'System'
              : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-sm text-[var(--text-primary)]">Theme</span>
        <p className="text-xs text-[var(--text-muted)]">
          Choose light, dark, or match your system settings
        </p>
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label="Theme">
        {THEME_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={themeMode === mode}
            onClick={() => handleThemeModeChange(mode)}
            className={`flex-1 rounded border py-2 text-xs font-semibold uppercase tracking-wider transition ${
              themeMode === mode
                ? 'border-[var(--accent-red)] bg-[var(--accent-red)] text-[var(--text-on-accent)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {mode === 'system'
              ? 'System'
              : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
