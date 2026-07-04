import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type StatsRowSkeletonProps = {
  className?: string;
};

export function StatsRowSkeleton({ className }: StatsRowSkeletonProps) {
  return (
    <div
      data-testid="stats-row-skeleton"
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5',
        className,
      )}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center"
        >
          <Skeleton variant="text" className="mx-auto mb-2 h-3 w-16" />
          <Skeleton variant="text" className="mx-auto h-6 w-12" />
        </div>
      ))}
    </div>
  );
}
