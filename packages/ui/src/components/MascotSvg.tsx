import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';

export type MascotExpression = 'happy' | 'wave' | 'sleepy' | 'cheer';

export type MascotSvgProps = {
  /** Drives the face/pose. Defaults to a friendly idle 'happy'. */
  expression?: MascotExpression;
  ariaLabel?: string;
  /** Disable the gentle idle bob regardless of motion preference. */
  still?: boolean;
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Hobbit — the app mascot. A small, cozy acorn-shaped creature with a leaf
 * sprout, drawn with fixed brand colors so its identity stays consistent in
 * light and dark themes (only the surrounding surface adapts). The idle bob
 * respects prefers-reduced-motion. The same core creature is exported as the
 * app/website icon set (see scripts/generate-mascot-icons.mjs).
 */
export function MascotSvg({
  expression = 'happy',
  ariaLabel = 'Hobbit, your habit companion',
  still = false,
  className,
}: MascotSvgProps) {
  const [allowMotion, setAllowMotion] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setAllowMotion(!mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  const bob = allowMotion && !still;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      data-testid="mascot-svg"
      data-expression={expression}
      viewBox="0 0 240 240"
      className={cn('h-24 w-24 shrink-0', className)}
    >
      <g className={bob ? 'mascot-bob' : undefined} data-testid="mascot-body">
        {/* soft ground shadow */}
        <ellipse cx="120" cy="212" rx="62" ry="12" fill="#00000018" />

        {/* leaf sprout */}
        <g transform="rotate(-12 120 60)">
          <path
            d="M120 66 C120 40 138 24 160 22 C160 46 144 64 120 66 Z"
            fill="#6FA84B"
          />
          <path
            d="M120 66 C120 46 133 33 152 30"
            fill="none"
            stroke="#4F8233"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="117" y="60" width="6" height="20" rx="3" fill="#7A5A3A" />
        </g>

        {/* body — warm acorn */}
        <path
          d="M120 74 C176 74 202 116 202 154 C202 196 166 220 120 220 C74 220 38 196 38 154 C38 116 64 74 120 74 Z"
          fill="#C9743B"
        />
        {/* belly highlight */}
        <ellipse cx="120" cy="164" rx="52" ry="44" fill="#E8A86A" />

        {/* acorn cap */}
        <path
          d="M120 74 C80 74 52 92 48 112 C70 100 96 96 120 96 C144 96 170 100 192 112 C188 92 160 74 120 74 Z"
          fill="#8A5230"
        />
        <path
          d="M120 96 C96 96 70 100 48 112 L192 112 C170 100 144 96 120 96 Z"
          fill="#6E3F24"
          opacity="0.5"
        />

        {/* cheeks */}
        <ellipse cx="82" cy="158" rx="12" ry="8" fill="#E9836B" opacity="0.6" />
        <ellipse
          cx="158"
          cy="158"
          rx="12"
          ry="8"
          fill="#E9836B"
          opacity="0.6"
        />

        {/* eyes */}
        {expression === 'sleepy' ? (
          <>
            <path
              d="M84 146 q10 8 20 0"
              fill="none"
              stroke="#2A2320"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M136 146 q10 8 20 0"
              fill="none"
              stroke="#2A2320"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <circle cx="94" cy="146" r="9" fill="#2A2320" />
            <circle cx="146" cy="146" r="9" fill="#2A2320" />
            <circle cx="97" cy="143" r="3" fill="#FFFFFF" />
            <circle cx="149" cy="143" r="3" fill="#FFFFFF" />
          </>
        )}

        {/* mouth */}
        {expression === 'cheer' ? (
          <path d="M104 168 q16 18 32 0 q-16 8 -32 0 Z" fill="#6E3F24" />
        ) : (
          <path
            d="M108 168 q12 12 24 0"
            fill="none"
            stroke="#6E3F24"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}

        {/* little feet */}
        <ellipse cx="96" cy="216" rx="12" ry="7" fill="#8A5230" />
        <ellipse cx="144" cy="216" rx="12" ry="7" fill="#8A5230" />

        {/* waving arm */}
        {expression === 'wave' || expression === 'cheer' ? (
          <g
            className={bob ? 'mascot-wave' : undefined}
            style={{ transformOrigin: '196px 150px' }}
            data-testid="mascot-arm"
          >
            <path
              d="M192 150 C210 140 220 128 218 116"
              fill="none"
              stroke="#C9743B"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
