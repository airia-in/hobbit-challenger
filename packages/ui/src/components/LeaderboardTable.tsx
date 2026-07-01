import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export type LeaderboardMember = {
  rank: number;
  id: string;
  name: string;
  avatarUrl: string | null;
  currentDay: number;
  status: 'ACTIVE' | 'COMPLETED';
  streak: number;
  xp?: number;
  successRate: number;
};

export type LeaderboardSortBy =
  | 'day'
  | 'successRate'
  | 'streak'
  | 'name'
  | 'xp';

export type LeaderboardTableProps = {
  members: LeaderboardMember[];
  sortBy: LeaderboardSortBy;
  onSortChange: (sortBy: LeaderboardSortBy) => void;
  highlightUserId?: string;
  renderAvatar?: (member: LeaderboardMember) => ReactNode;
  className?: string;
};

const SORT_OPTIONS: { value: LeaderboardSortBy; label: string }[] = [
  { value: 'xp', label: 'XP' },
  { value: 'day', label: 'Current Day' },
  { value: 'successRate', label: 'Success Rate' },
  { value: 'streak', label: 'Streak' },
  { value: 'name', label: 'Name' },
];

function MemberAvatar({
  member,
  renderAvatar,
}: {
  member: LeaderboardMember;
  renderAvatar?: (member: LeaderboardMember) => ReactNode;
}) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--border)] text-xs font-bold text-[var(--text-muted)]">
      {renderAvatar ? (
        renderAvatar(member)
      ) : member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        member.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

export function LeaderboardTable({
  members,
  sortBy,
  onSortChange,
  highlightUserId,
  renderAvatar,
  className,
}: LeaderboardTableProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Full Rankings
        </h2>
        <label className="flex items-center gap-2">
          <span className="sr-only">Sort leaderboard by</span>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as LeaderboardSortBy)}
            aria-label="Sort leaderboard by"
            className="max-w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--text-primary)]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="space-y-0 rounded-lg border border-[var(--border)] md:hidden"
        data-testid="leaderboard-mobile-list"
        role="list"
      >
        {members.map((member) => (
          <div
            key={member.id}
            aria-current={member.id === highlightUserId ? 'true' : undefined}
            className={cn(
              'border-b border-[var(--border)] px-3 py-3 last:border-0',
              member.id === highlightUserId && 'bg-[var(--accent-red)]/5',
            )}
            role="listitem"
          >
            <div className="flex min-w-0 gap-2">
              <span
                className="w-10 shrink-0 font-bold text-[var(--text-primary)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                #{member.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <MemberAvatar member={member} renderAvatar={renderAvatar} />
                  <span
                    className="min-w-0 flex-1 truncate text-[var(--text-primary)]"
                    title={member.name}
                  >
                    {member.name}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-[var(--text-primary)]">
                    <span className="sr-only">Success </span>
                    {member.successRate}%
                  </span>
                </div>
                <div
                  className="mt-1 truncate text-xs text-[var(--text-muted)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  Day {member.currentDay > 0 ? member.currentDay : '—'}
                  {' · '}
                  Streak {member.streak}
                  {' · '}
                  {member.xp ?? 0} XP
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-[var(--border)] md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[var(--text-muted)]"
              >
                Rank
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[var(--text-muted)]"
              >
                Member
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]"
              >
                Day
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]"
              >
                Streak
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]"
              >
                XP
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]"
              >
                Success
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.id}
                aria-current={
                  member.id === highlightUserId ? 'true' : undefined
                }
                className={cn(
                  'border-b border-[var(--border)] last:border-0',
                  member.id === highlightUserId && 'bg-[var(--accent-red)]/5',
                )}
              >
                <td
                  className="px-4 py-3 font-bold text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  #{member.rank}
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <MemberAvatar member={member} renderAvatar={renderAvatar} />
                    <span
                      className="truncate text-[var(--text-primary)]"
                      title={member.name}
                    >
                      {member.name}
                    </span>
                  </div>
                </td>
                <td
                  className="px-4 py-3 text-right text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {member.currentDay > 0 ? member.currentDay : '—'}
                </td>
                <td className="px-4 py-3 text-right text-[var(--text-primary)]">
                  {member.streak}
                </td>
                <td
                  className="px-4 py-3 text-right text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {member.xp ?? 0}
                </td>
                <td className="px-4 py-3 text-right text-[var(--text-primary)]">
                  {member.successRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
