import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type PodiumBlockSkeletonProps = {
  className?: string;
};

const PODIUM_HEIGHTS = [
  'h-14 md:h-20',
  'h-20 md:h-28',
  'h-12 md:h-16',
] as const;
const PODIUM_ORDERS = ['order-1', 'order-2', 'order-3'] as const;

export function PodiumBlockSkeleton({ className }: PodiumBlockSkeletonProps) {
  return (
    <div
      data-testid="podium-block-skeleton"
      className={cn('flex items-end gap-2', className)}
      aria-hidden="true"
    >
      {PODIUM_HEIGHTS.map((height, index) => (
        <div
          key={index}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center',
            PODIUM_ORDERS[index],
          )}
        >
          <Skeleton
            variant="rect"
            className={cn('w-full rounded-t-lg', height)}
          />
          <Skeleton variant="text" className="mt-2 h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
