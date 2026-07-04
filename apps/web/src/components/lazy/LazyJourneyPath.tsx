import { lazy, Suspense } from 'react';
import {
  JourneyPathSkeleton,
  type JourneyPathProps,
} from '@workspace-starter/ui';

const JourneyPath = lazy(() =>
  import('@workspace-starter/ui').then((module) => ({
    default: module.JourneyPath,
  })),
);

export function LazyJourneyPath(props: JourneyPathProps) {
  return (
    <Suspense fallback={<JourneyPathSkeleton />}>
      <JourneyPath {...props} />
    </Suspense>
  );
}
