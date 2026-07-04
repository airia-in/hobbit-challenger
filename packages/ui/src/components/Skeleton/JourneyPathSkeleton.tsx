import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type JourneyPathSkeletonProps = {
  tileCount?: number;
  className?: string;
};

export function JourneyPathSkeleton({
  tileCount = 10,
  className,
}: JourneyPathSkeletonProps) {
  return (
    <div
      data-testid="journey-path-skeleton"
      className={cn('space-y-4', className)}
      aria-hidden="true"
    >
      <Skeleton variant="text" className="h-5 w-32" />
      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: tileCount }, (_, index) => (
          <Skeleton
            key={index}
            variant="rect"
            className="h-10 w-10 shrink-0 rounded-md"
          />
        ))}
      </div>
    </div>
  );
}
