import { HeatmapGrid, type HeatmapGridProps } from '@workspace-starter/ui';

// Renders eagerly; loading is shown via data-driven skeletons, not chunk-load
// Suspense. See LazyCompanionPanel for the rationale.
export function LazyHeatmapGrid(props: HeatmapGridProps) {
  return <HeatmapGrid {...props} />;
}
