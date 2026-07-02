import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';

export type XpTotalBarProps = {
  netXp: number;
  personalXp?: number;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
};

function useAnimatedXp(target: number, duration = 400) {
  const [value, setValue] = useState(target);
  const frameRef = useRef<number | undefined>(undefined);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  useEffect(() => {
    fromRef.current = value;
  }, [value]);

  return value;
}

export function XpTotalBar({
  netXp,
  personalXp,
  className,
  labelClassName,
  valueClassName,
}: XpTotalBarProps) {
  const animatedNet = useAnimatedXp(netXp);
  const animatedPersonal =
    personalXp !== undefined ? useAnimatedXp(personalXp) : undefined;

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3',
        className,
      )}
    >
      <div>
        <p
          className={cn(
            'text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]',
            labelClassName,
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Path XP today
        </p>
        <p
          className={cn('text-3xl text-[var(--accent-red)]', valueClassName)}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {animatedNet}
          <span className="ml-1 text-lg text-[var(--text-muted)]">XP</span>
        </p>
      </div>
      {animatedPersonal !== undefined && (
        <div className="text-right">
          <p
            className={cn(
              'text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]',
              labelClassName,
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Personal
          </p>
          <p
            className={cn('text-xl text-[var(--text-primary)]', valueClassName)}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {animatedPersonal}
            <span className="ml-1 text-sm text-[var(--text-muted)]">XP</span>
          </p>
        </div>
      )}
    </div>
  );
}
