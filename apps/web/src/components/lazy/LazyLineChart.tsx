import { lazy, Suspense } from 'react';
import { LineChartSkeleton, type LineChartProps } from '@workspace-starter/ui';

const LineChart = lazy(() =>
  import('@workspace-starter/ui').then((module) => ({
    default: module.LineChart,
  })),
);

export function LazyLineChart(props: LineChartProps) {
  return (
    <Suspense fallback={<LineChartSkeleton />}>
      <LineChart {...props} />
    </Suspense>
  );
}
