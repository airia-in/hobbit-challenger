import { lazy, Suspense } from 'react';
import {
  HeatmapGridSkeleton,
  type HeatmapGridProps,
} from '@workspace-starter/ui';

const HeatmapGrid = lazy(() =>
  import('@workspace-starter/ui').then((module) => ({
    default: module.HeatmapGrid,
  })),
);

export function LazyHeatmapGrid(props: HeatmapGridProps) {
  return (
    <Suspense fallback={<HeatmapGridSkeleton cellCount={props.cells.length} />}>
      <HeatmapGrid {...props} />
    </Suspense>
  );
}
