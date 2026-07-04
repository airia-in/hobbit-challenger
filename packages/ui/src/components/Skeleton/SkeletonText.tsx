import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export type SkeletonTextProps = {
  lines?: number;
  className?: string;
};

const LINE_WIDTHS = ['w-full', 'w-3/4', 'w-1/2'] as const;

export function SkeletonText({ lines = 2, className }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          variant="text"
          className={LINE_WIDTHS[index % LINE_WIDTHS.length]}
        />
      ))}
    </div>
  );
}
