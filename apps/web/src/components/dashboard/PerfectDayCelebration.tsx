import { useEffect, useRef, useState } from 'react';

const PARTICLE_COUNT = 24;
const COLORS = [
  'var(--accent-red)',
  'var(--gold-fill)',
  'var(--success)',
  'var(--confetti-warm-1)',
  'var(--confetti-warm-2)',
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
  const overlayRef = useRef<HTMLDivElement>(null);

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

    const finish = () => {
      setVisible(false);
      onDone();
    };

    const timeout = setTimeout(finish, 2800);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        finish();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, onDone]);

  useEffect(() => {
    if (visible) {
      overlayRef.current?.focus();
    }
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    onDone();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 cursor-pointer overflow-hidden"
      data-testid="perfect-day-confetti"
      aria-hidden
      tabIndex={-1}
      onClick={dismiss}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          dismiss();
        }
      }}
      role="presentation"
    >
      {Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const left = (index * 17 + 11) % 100;
        const delay = (index % 8) * 0.08;
        const duration = 1.8 + (index % 5) * 0.15;
        const color = COLORS[index % COLORS.length];
        const size = 6 + (index % 4) * 2;
        const drift =
          index % 2 === 0 ? 'confetti-drift-left' : 'confetti-drift-right';

        return (
          <span
            key={index}
            className={`confetti-particle pointer-events-none ${drift}`}
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
