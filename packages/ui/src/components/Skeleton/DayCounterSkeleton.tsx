import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type DayCounterSkeletonProps = {
  className?: string;
};

export function DayCounterSkeleton({ className }: DayCounterSkeletonProps) {
  return (
    <div
      data-testid="day-counter-skeleton"
      className={cn('space-y-3 text-center', className)}
      aria-hidden="true"
    >
      <Skeleton variant="text" className="mx-auto h-3 w-12" />
      <Skeleton variant="text" className="mx-auto h-12 w-20" />
      <Skeleton variant="rect" className="mx-auto h-2 max-w-md" />
      <div className="flex justify-center gap-6">
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton variant="text" className="h-3 w-24" />
      </div>
    </div>
  );
}
