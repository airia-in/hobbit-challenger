import {
  CompanionPanel,
  type CompanionPanelProps,
} from '../dashboard/CompanionPanel';

// Renders eagerly. Loading is communicated by the data-driven skeletons in the
// dashboard (shown while the underlying queries are pending), not by a
// chunk-load Suspense boundary — React.lazy dynamic imports proved fragile in
// the test environment and would need an extra error boundary for stale chunks.
// True code-splitting can be revisited as a separate optimization.
export function LazyCompanionPanel(props: CompanionPanelProps) {
  return <CompanionPanel {...props} />;
}
