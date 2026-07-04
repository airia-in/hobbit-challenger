import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type LineChartSkeletonProps = {
  className?: string;
};

export function LineChartSkeleton({ className }: LineChartSkeletonProps) {
  return (
    <div
      data-testid="line-chart-skeleton"
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4',
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex h-[220px] flex-col justify-end gap-2">
        <Skeleton variant="rect" className="h-[140px] w-full rounded-md" />
        <div className="flex justify-between">
          <Skeleton variant="text" className="h-3 w-8" />
          <Skeleton variant="text" className="h-3 w-8" />
          <Skeleton variant="text" className="h-3 w-8" />
          <Skeleton variant="text" className="h-3 w-8" />
        </div>
      </div>
    </div>
  );
}
