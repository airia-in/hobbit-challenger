import { lazy, Suspense } from 'react';
import { CompanionPanelSkeleton } from '@workspace-starter/ui';
import type { CompanionPanelProps } from '../dashboard/CompanionPanel';

const CompanionPanel = lazy(() =>
  import('../dashboard/CompanionPanel').then((module) => ({
    default: module.CompanionPanel,
  })),
);

export function LazyCompanionPanel(props: CompanionPanelProps) {
  return (
    <Suspense fallback={<CompanionPanelSkeleton />}>
      <CompanionPanel {...props} />
    </Suspense>
  );
}
