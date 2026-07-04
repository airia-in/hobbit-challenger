import { LineChart, type LineChartProps } from '@workspace-starter/ui';

// Renders eagerly; loading is shown via data-driven skeletons, not chunk-load
// Suspense. See LazyCompanionPanel for the rationale.
export function LazyLineChart(props: LineChartProps) {
  return <LineChart {...props} />;
}
