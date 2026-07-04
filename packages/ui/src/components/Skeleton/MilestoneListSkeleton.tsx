import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type MilestoneListSkeletonProps = {
  className?: string;
};

export function MilestoneListSkeleton({
  className,
}: MilestoneListSkeletonProps) {
  return (
    <section
      data-testid="milestone-list-skeleton"
      className={cn(
        'space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4',
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton variant="text" className="h-6 w-40" />
      {Array.from({ length: 2 }, (_, index) => (
        <div
          key={index}
          className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3"
        >
          <Skeleton variant="text" className="h-4 w-1/2" />
          <Skeleton variant="text" className="h-3 w-full" />
          <Skeleton variant="rect" className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </section>
  );
}
