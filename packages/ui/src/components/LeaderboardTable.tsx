import { cn } from '../utils/cn';

export type LeaderboardMember = {
  rank: number;
  id: string;
  name: string;
  avatarUrl: string | null;
  currentDay: number;
  status: 'ACTIVE' | 'ELIMINATED' | 'COMPLETED';
  streak: number;
  successRate: number;
};

export type LeaderboardSortBy = 'day' | 'successRate' | 'streak' | 'name';

export type LeaderboardTableProps = {
  members: LeaderboardMember[];
  sortBy: LeaderboardSortBy;
  onSortChange: (sortBy: LeaderboardSortBy) => void;
  highlightUserId?: string;
  className?: string;
};

const SORT_OPTIONS: { value: LeaderboardSortBy; label: string }[] = [
  { value: 'day', label: 'Current Day' },
  { value: 'successRate', label: 'Success Rate' },
  { value: 'streak', label: 'Streak' },
  { value: 'name', label: 'Name' },
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-[var(--success)]',
  ELIMINATED: 'text-[var(--accent-red)]',
  COMPLETED: 'text-[var(--gold)]',
};

export function LeaderboardTable({
  members,
  sortBy,
  onSortChange,
  highlightUserId,
  className,
}: LeaderboardTableProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2
          className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Full Rankings
        </h2>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as LeaderboardSortBy)}
          className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--text-primary)]"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Member
              </th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Day
              </th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Streak
              </th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Success
              </th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.id}
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
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-xs font-bold text-[var(--text-muted)]">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        member.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="text-[var(--text-primary)]">
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
                <td className="px-4 py-3 text-right text-[var(--text-primary)]">
                  {member.successRate}%
                </td>
                <td
                  className={cn(
                    'px-4 py-3 text-right text-xs uppercase tracking-wider',
                    STATUS_COLORS[member.status],
                  )}
                >
                  {member.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
