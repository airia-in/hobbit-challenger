let bootstrapPromise: Promise<void> | null = null;
let resolveBootstrap: (() => void) | null = null;

/** Called when native deep-link bootstrap begins on a Capacitor WebView. */
export function markNativeDeepLinkBootstrapStarted(): void {
  if (bootstrapPromise) return;
  bootstrapPromise = new Promise<void>((resolve) => {
    resolveBootstrap = resolve;
  });
}

/** Called when getLaunchUrl and initial listener registration have settled. */
export function markNativeDeepLinkBootstrapSettled(): void {
  resolveBootstrap?.();
  resolveBootstrap = null;
}

/**
 * Blocks auth redirects until cold-start deep-link routing finishes.
 * No-op on plain web where bootstrap never starts.
 */
export async function awaitNativeDeepLinkBootstrap(): Promise<void> {
  if (!bootstrapPromise) return;
  await bootstrapPromise;
}

/** Test helper — reset module state between cases. */
export function resetNativeDeepLinkBootstrapForTests(): void {
  markNativeDeepLinkBootstrapSettled();
  bootstrapPromise = null;
}
