import {
  CompletionHeatmap,
  type CompletionHeatmapProps,
} from '@workspace-starter/ui';

// Renders eagerly; loading is shown via data-driven skeletons, not chunk-load
// Suspense. See LazyCompanionPanel for the rationale.
export function LazyCompletionHeatmap(props: CompletionHeatmapProps) {
  return <CompletionHeatmap {...props} />;
}
