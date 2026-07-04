export type ReconcileGate = {
  /** Call when a mutation starts (its onMutate). */
  begin: () => void;
  /** Call when a mutation settles (its onSettled). Runs `reconcile` only once
   *  the last in-flight mutation has settled. */
  settle: () => void;
  /** Number of mutations currently in flight (exposed for tests). */
  inFlight: () => number;
};

/**
 * Coalesces server reconciliation across overlapping optimistic mutations.
 *
 * Activity logging updates the cache optimistically and fires the mutation in
 * the background, so a user can log several activities back-to-back without
 * waiting. If we invalidated queries after every mutation settled, a refetch
 * triggered mid-burst would return server data that doesn't yet include the
 * later optimistic edits and briefly revert them. Instead we count in-flight
 * mutations and reconcile once, after the last one settles.
 */
export function createReconcileGate(reconcile: () => void): ReconcileGate {
  let count = 0;
  return {
    begin() {
      count += 1;
    },
    settle() {
      count = Math.max(0, count - 1);
      if (count === 0) {
        reconcile();
      }
    },
    inFlight() {
      return count;
    },
  };
}
