import { describe, expect, it, vi } from 'vitest';
import { createReconcileGate } from '../src/lib/reconcile-gate';

describe('createReconcileGate', () => {
  it('reconciles once after a single mutation settles', () => {
    const reconcile = vi.fn();
    const gate = createReconcileGate(reconcile);
    gate.begin();
    expect(reconcile).not.toHaveBeenCalled();
    gate.settle();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('reconciles only once after overlapping mutations all settle', () => {
    const reconcile = vi.fn();
    const gate = createReconcileGate(reconcile);
    // Three activities logged back-to-back before any server response.
    gate.begin();
    gate.begin();
    gate.begin();
    expect(gate.inFlight()).toBe(3);

    gate.settle();
    expect(reconcile).not.toHaveBeenCalled(); // still 2 in flight
    gate.settle();
    expect(reconcile).not.toHaveBeenCalled(); // still 1 in flight
    gate.settle();
    expect(reconcile).toHaveBeenCalledTimes(1); // last one: reconcile once
    expect(gate.inFlight()).toBe(0);
  });

  it('reconciles again for a fresh burst after settling', () => {
    const reconcile = vi.fn();
    const gate = createReconcileGate(reconcile);
    gate.begin();
    gate.settle();
    gate.begin();
    gate.settle();
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('never lets the counter go negative on an unmatched settle', () => {
    const reconcile = vi.fn();
    const gate = createReconcileGate(reconcile);
    gate.settle();
    expect(gate.inFlight()).toBe(0);
    // A later real burst still reconciles correctly.
    gate.begin();
    gate.settle();
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
});
