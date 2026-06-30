export function verdictClass(verdict: string | null): string {
  if (verdict === 'PASSED' || verdict === 'BONUS') {
    return 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10';
  }
  if (verdict === 'FAILED') {
    return 'text-[var(--accent-red)] border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10';
  }
  return 'text-[var(--text-muted)] border-[var(--border)] bg-[var(--surface-raised)]';
}

export function verdictLabel(verdict: string | null): string {
  if (verdict === 'PASSED' || verdict === 'BONUS') {
    return 'Verified';
  }
  if (verdict === 'FAILED') {
    return 'Not verified';
  }
  if (verdict === 'SKIPPED') {
    return 'Not checked';
  }
  return verdict ?? '';
}
