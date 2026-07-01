import { cn } from '../utils/cn';
import type { LeaderboardMember } from './LeaderboardTable';

export type PodiumBlockProps = {
  podium: LeaderboardMember[];
  className?: string;
};

const PODIUM_STYLES = [
  {
    order: 'order-2',
    height: 'h-20 md:h-28',
    color: 'text-[var(--gold)]',
    bg: 'bg-[var(--gold)]/10 border-[var(--gold)]',
    medal: '🥇',
    label: '1st',
  },
  {
    order: 'order-1',
    height: 'h-14 md:h-20',
    color: 'text-[var(--silver)]',
    bg: 'bg-[var(--silver)]/10 border-[var(--silver)]',
    medal: '🥈',
    label: '2nd',
  },
  {
    order: 'order-3',
    height: 'h-12 md:h-16',
    color: 'text-[var(--bronze)]',
    bg: 'bg-[var(--bronze)]/10 border-[var(--bronze)]',
    medal: '🥉',
    label: '3rd',
  },
];

function PodiumSlot({
  member,
  style,
}: {
  member: LeaderboardMember | undefined;
  style: (typeof PODIUM_STYLES)[number];
}) {
  if (!member) {
    return (
      <div
        className={cn('flex min-w-0 flex-1 flex-col items-center', style.order)}
      >
        <div
          className={cn(
            'flex w-full items-end justify-center rounded-t-lg border border-dashed border-[var(--border)]',
            style.height,
          )}
        />
        <p className="mt-1 text-[10px] text-[var(--text-muted)] md:mt-2 md:text-xs">
          {style.label}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn('flex min-w-0 flex-1 flex-col items-center', style.order)}
    >
      <div className="mb-1 w-full min-w-0 px-0.5 text-center md:mb-2">
        <span className="text-xl md:text-2xl">{style.medal}</span>
        <p
          className={cn('truncate text-xs font-medium md:text-sm', style.color)}
          title={member.name}
        >
          {member.name}
        </p>
        <p className="truncate text-[10px] text-[var(--text-muted)] md:text-xs">
          Day {member.currentDay}
          {member.xp != null ? ` · ${member.xp} XP` : ''}
        </p>
      </div>
      <div
        className={cn(
          'flex w-full items-end justify-center rounded-t-lg border',
          style.height,
          style.bg,
        )}
      >
        <span
          className={cn('pb-1 text-2xl md:pb-2 md:text-3xl', style.color)}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {member.rank}
        </span>
      </div>
    </div>
  );
}

export function PodiumBlock({ podium, className }: PodiumBlockProps) {
  const [first, second, third] = podium;

  return (
    <div className={cn('flex items-end gap-1 md:gap-3 md:px-4', className)}>
      <PodiumSlot member={second} style={PODIUM_STYLES[1]!} />
      <PodiumSlot member={first} style={PODIUM_STYLES[0]!} />
      <PodiumSlot member={third} style={PODIUM_STYLES[2]!} />
    </div>
  );
}
