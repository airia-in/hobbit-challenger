import type { CompanionMood } from '@workspace-starter/types';
import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';

export type CompanionSvgProps = {
  mood: CompanionMood;
  ariaLabel: string;
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CompanionSvg({
  mood,
  ariaLabel,
  className,
}: CompanionSvgProps) {
  const [allowMotion, setAllowMotion] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setAllowMotion(!mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      data-testid="companion-svg"
      data-mood={mood}
      viewBox="0 0 120 80"
      className={cn('h-16 w-24 shrink-0', className)}
    >
      <ellipse
        cx="60"
        cy="58"
        rx="48"
        ry="20"
        fill="var(--surface-raised)"
        stroke="var(--border)"
        strokeWidth="1"
      />

      <ellipse
        cx="60"
        cy="52"
        rx="38"
        ry="14"
        fill="color-mix(in srgb, var(--success) 25%, var(--surface-raised))"
      />

      <rect x="72" y="30" width="6" height="14" rx="1" fill="var(--border)" />
      {mood === 'content' || mood === 'thriving' ? (
        <g
          className={allowMotion ? 'companion-smoke-rise' : undefined}
          data-testid="companion-smoke"
        >
          <ellipse
            cx="75"
            cy="26"
            rx="3"
            ry="2"
            fill="var(--text-muted)"
            opacity="0.5"
          />
          <ellipse
            cx="77"
            cy="22"
            rx="2.5"
            ry="1.8"
            fill="var(--text-muted)"
            opacity="0.35"
          />
        </g>
      ) : null}

      <circle cx="60" cy="48" r="11" fill="var(--border)" />
      <circle cx="60" cy="48" r="8" fill="var(--surface)" />
      {(mood === 'rainy' || mood === 'sleepy') && (
        <rect
          x="56"
          y="42"
          width="8"
          height="6"
          rx="1"
          fill={
            mood === 'rainy'
              ? 'color-mix(in srgb, var(--gold-fill) 70%, transparent)'
              : 'color-mix(in srgb, var(--gold-fill) 35%, transparent)'
          }
        />
      )}

      {mood === 'thriving' && (
        <g data-testid="companion-thriving-elements">
          <circle cx="95" cy="16" r="9" fill="var(--gold-fill)" />
          <circle cx="30" cy="50" r="3" fill="var(--success)" />
          <circle
            cx="38"
            cy="46"
            r="2.5"
            fill="color-mix(in srgb, var(--success) 80%, var(--gold-fill))"
          />
          <circle cx="85" cy="48" r="2.5" fill="var(--success)" />
        </g>
      )}

      {mood === 'sleepy' && (
        <g data-testid="companion-sleepy-elements">
          <circle
            cx="92"
            cy="18"
            r="7"
            fill="color-mix(in srgb, var(--text-muted) 40%, var(--surface-raised))"
          />
        </g>
      )}

      {mood === 'rainy' && (
        <g
          className={allowMotion ? 'companion-rain-fall' : undefined}
          data-testid="companion-rain"
        >
          <line
            x1="20"
            y1="8"
            x2="16"
            y2="18"
            stroke="var(--text-muted)"
            strokeWidth="1"
            opacity="0.6"
          />
          <line
            x1="35"
            y1="4"
            x2="31"
            y2="14"
            stroke="var(--text-muted)"
            strokeWidth="1"
            opacity="0.5"
          />
          <line
            x1="50"
            y1="10"
            x2="46"
            y2="20"
            stroke="var(--text-muted)"
            strokeWidth="1"
            opacity="0.55"
          />
          <line
            x1="70"
            y1="6"
            x2="66"
            y2="16"
            stroke="var(--text-muted)"
            strokeWidth="1"
            opacity="0.5"
          />
          <line
            x1="88"
            y1="12"
            x2="84"
            y2="22"
            stroke="var(--text-muted)"
            strokeWidth="1"
            opacity="0.45"
          />
        </g>
      )}
    </svg>
  );
}
