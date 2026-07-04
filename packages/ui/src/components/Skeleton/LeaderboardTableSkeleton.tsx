import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type LeaderboardTableSkeletonProps = {
  rowCount?: number;
  className?: string;
};

export function LeaderboardTableSkeleton({
  rowCount = 7,
  className,
}: LeaderboardTableSkeletonProps) {
  return (
    <div
      data-testid="leaderboard-table-skeleton"
      className={cn('space-y-4', className)}
      aria-hidden="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton variant="text" className="h-5 w-32" />
        <Skeleton variant="rect" className="h-8 w-28 rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rowCount }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            <Skeleton variant="text" className="h-4 w-6" />
            <Skeleton variant="circle" className="h-8 w-8 shrink-0" />
            <Skeleton variant="text" className="h-4 flex-1" />
            <Skeleton variant="text" className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
