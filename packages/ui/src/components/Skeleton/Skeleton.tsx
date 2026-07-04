import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../utils/cn';

const skeletonVariants = cva(
  'bg-[var(--skeleton-base)] motion-safe:animate-pulse',
  {
    variants: {
      variant: {
        text: 'h-4 rounded-md',
        circle: 'rounded-full',
        rect: 'rounded-md',
      },
      shimmer: {
        true: 'motion-safe:skeleton-shimmer motion-safe:animate-none',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'rect',
      shimmer: false,
    },
  },
);

export interface SkeletonProps
  extends
    ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof skeletonVariants> {}

export function Skeleton({
  className,
  variant,
  shimmer,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants({ variant, shimmer, className }))}
      {...props}
    />
  );
}
