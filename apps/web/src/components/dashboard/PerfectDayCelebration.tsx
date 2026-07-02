import { useEffect, useState } from 'react';

const PARTICLE_COUNT = 24;
const COLORS = [
  'var(--accent-red)',
  'var(--gold)',
  'var(--success)',
  '#f4d58d',
  '#e8c4a0',
];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type PerfectDayCelebrationProps = {
  active: boolean;
  onDone: () => void;
};

export function PerfectDayCelebration({
  active,
  onDone,
}: PerfectDayCelebrationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    if (prefersReducedMotion()) {
      onDone();
      return;
    }

    setVisible(true);
    const timeout = setTimeout(() => {
      setVisible(false);
      onDone();
    }, 2800);

    return () => clearTimeout(timeout);
  }, [active, onDone]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-testid="perfect-day-confetti"
      aria-hidden
    >
      {Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const left = (index * 17 + 11) % 100;
        const delay = (index % 8) * 0.08;
        const duration = 1.8 + (index % 5) * 0.15;
        const color = COLORS[index % COLORS.length];
        const size = 6 + (index % 4) * 2;
        const drift = index % 2 === 0 ? 'confetti-drift-left' : 'confetti-drift-right';

        return (
          <span
            key={index}
            className={`confetti-particle ${drift}`}
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              backgroundColor: color,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </div>
  );
}
