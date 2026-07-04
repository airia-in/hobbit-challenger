import { cn } from '../../utils/cn';
import { getHeatmapColumnCount } from '../HeatmapGrid';
import { Skeleton } from './Skeleton';

export type HeatmapGridSkeletonProps = {
  cellCount?: number;
  className?: string;
};

export function HeatmapGridSkeleton({
  cellCount = 75,
  className,
}: HeatmapGridSkeletonProps) {
  const columns = getHeatmapColumnCount(cellCount);

  return (
    <div
      data-testid="heatmap-grid-skeleton"
      className={cn('grid gap-1', className)}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(1.25rem, 1fr))`,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: cellCount }, (_, index) => (
        <Skeleton key={index} variant="rect" className="aspect-square w-full" />
      ))}
    </div>
  );
}
