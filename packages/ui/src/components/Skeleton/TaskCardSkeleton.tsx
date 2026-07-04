import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type TaskCardSkeletonProps = {
  className?: string;
};

export function TaskCardSkeleton({ className }: TaskCardSkeletonProps) {
  return (
    <div
      data-testid="task-card-skeleton"
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-4',
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton variant="text" className="h-5 w-2/3" />
          <Skeleton variant="text" className="h-3 w-1/3" />
        </div>
        <Skeleton variant="rect" className="h-8 w-12 shrink-0 rounded-full" />
      </div>
    </div>
  );
}
