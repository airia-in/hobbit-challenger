import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type HistoryDayCardSkeletonProps = {
  taskRows?: number;
  className?: string;
};

export function HistoryDayCardSkeleton({
  taskRows = 3,
  className,
}: HistoryDayCardSkeletonProps) {
  return (
    <div
      data-testid="history-day-card-skeleton"
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4',
        className,
      )}
      aria-hidden="true"
    >
      <div className="mb-3 flex items-center justify-between">
        <Skeleton variant="text" className="h-4 w-28" />
        <Skeleton variant="text" className="h-3 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: taskRows }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2"
          >
            <Skeleton variant="text" className="h-4 w-2/3" />
            <Skeleton variant="text" className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
