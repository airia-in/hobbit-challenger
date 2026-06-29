import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';

export type DayCounterProps = {
  currentDay: number;
  totalDays?: number;
  startDate?: Date | string | null;
  estimatedFinishDate?: Date | string | null;
  className?: string;
  labelClassName?: string;
  numberClassName?: string;
  progressClassName?: string;
  metaClassName?: string;
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return value;
}

export function DayCounter({
  currentDay,
  totalDays = 75,
  startDate,
  estimatedFinishDate,
  className,
  labelClassName,
  numberClassName,
  progressClassName,
  metaClassName,
}: DayCounterProps) {
  const displayDay = Math.min(currentDay, totalDays);
  const animatedDay = useCountUp(displayDay);
  const progress = Math.min((displayDay / totalDays) * 100, 100);

  return (
    <div className={cn('text-center', className)}>
      <p
        className={cn(
          'text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]',
          labelClassName,
        )}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Day
      </p>
      <div
        className={cn(
          'mt-2 text-7xl leading-none text-[var(--text-primary)] sm:text-8xl',
          numberClassName,
        )}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <span className="text-[var(--accent-red)]">{animatedDay}</span>
        <span className="text-[var(--text-muted)]"> / {totalDays}</span>
      </div>

      <div
        className={cn(
          'mx-auto mt-6 h-2 max-w-md overflow-hidden rounded-full bg-[var(--surface-raised)]',
          progressClassName,
        )}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent-red)] to-[var(--accent-orange)] transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        className={cn(
          'mt-4 flex justify-center gap-6 text-xs text-[var(--text-muted)]',
          metaClassName,
        )}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span>Started {formatDate(startDate)}</span>
        <span>Est. finish {formatDate(estimatedFinishDate)}</span>
      </div>
    </div>
  );
}
