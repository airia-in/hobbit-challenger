import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type CompletionHeatmapSkeletonProps = {
  className?: string;
};

export function CompletionHeatmapSkeleton({
  className,
}: CompletionHeatmapSkeletonProps) {
  return (
    <div
      data-testid="completion-heatmap-skeleton"
      className={cn('space-y-4', className)}
      aria-hidden="true"
    >
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 28 }, (_, index) => (
          <Skeleton
            key={index}
            variant="rect"
            className="aspect-square w-full"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-2">
            <Skeleton variant="rect" className="h-3 w-3" />
            <Skeleton variant="text" className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
