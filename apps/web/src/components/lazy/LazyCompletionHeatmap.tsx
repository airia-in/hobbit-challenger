import { lazy, Suspense } from 'react';
import {
  CompletionHeatmapSkeleton,
  type CompletionHeatmapProps,
} from '@workspace-starter/ui';

const CompletionHeatmap = lazy(() =>
  import('@workspace-starter/ui').then((module) => ({
    default: module.CompletionHeatmap,
  })),
);

export function LazyCompletionHeatmap(props: CompletionHeatmapProps) {
  return (
    <Suspense fallback={<CompletionHeatmapSkeleton />}>
      <CompletionHeatmap {...props} />
    </Suspense>
  );
}
