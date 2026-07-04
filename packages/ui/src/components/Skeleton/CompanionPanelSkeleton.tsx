import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';
import { SkeletonText } from './SkeletonText';

export type CompanionPanelSkeletonProps = {
  className?: string;
};

export function CompanionPanelSkeleton({
  className,
}: CompanionPanelSkeletonProps) {
  return (
    <section
      data-testid="companion-panel-skeleton"
      className={cn('space-y-4', className)}
      aria-hidden="true"
    >
      <Skeleton variant="text" className="h-5 w-28" />
      <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <Skeleton variant="rect" className="h-16 w-16 shrink-0 rounded-lg" />
        <SkeletonText lines={2} className="min-w-0 flex-1" />
      </div>
    </section>
  );
}
