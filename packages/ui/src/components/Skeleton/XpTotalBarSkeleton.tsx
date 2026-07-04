import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type XpTotalBarSkeletonProps = {
  className?: string;
};

export function XpTotalBarSkeleton({ className }: XpTotalBarSkeletonProps) {
  return (
    <div
      data-testid="xp-total-bar-skeleton"
      className={cn(
        'flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3',
        className,
      )}
      aria-hidden="true"
    >
      <div className="space-y-2">
        <Skeleton variant="text" className="h-3 w-20" />
        <Skeleton variant="text" className="h-8 w-16" />
      </div>
      <div className="space-y-2 text-right">
        <Skeleton variant="text" className="ml-auto h-3 w-16" />
        <Skeleton variant="text" className="ml-auto h-6 w-12" />
      </div>
    </div>
  );
}
