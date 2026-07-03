const inboundUserHits = new Map<string, number[]>();
const outboundHits = new Map<string, number[]>();

export const WEBHOOK_USER_RATE_MAX = 60;
export const WEBHOOK_USER_RATE_WINDOW_MS = 60_000;
export const WEBHOOK_OUTBOUND_CONFIRM_MAX = 3;
export const WEBHOOK_OUTBOUND_CONFIRM_WINDOW_MS = 60 * 60_000;

function pruneHits(hits: number[], windowMs: number, now: number): number[] {
  return hits.filter((timestamp) => now - timestamp < windowMs);
}

function checkAndRecordHit(
  store: Map<string, number[]>,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const hits = pruneHits(store.get(key) ?? [], windowMs, now);
  if (hits.length >= max) {
    store.set(key, hits);
    return false;
  }
  hits.push(now);
  store.set(key, hits);
  return true;
}

/** Per authenticated user inbound budget (post DB lookup; not spoofable via JID). */
export function checkWebhookUserRateLimit(userId: string): boolean {
  return checkAndRecordHit(
    inboundUserHits,
    userId,
    WEBHOOK_USER_RATE_MAX,
    WEBHOOK_USER_RATE_WINDOW_MS,
  );
}

export function checkOutboundConfirmationAllowed(userId: string): boolean {
  const now = Date.now();
  const hits = pruneHits(
    outboundHits.get(userId) ?? [],
    WEBHOOK_OUTBOUND_CONFIRM_WINDOW_MS,
    now,
  );
  return hits.length < WEBHOOK_OUTBOUND_CONFIRM_MAX;
}

export function recordOutboundConfirmation(userId: string): void {
  const now = Date.now();
  const hits = pruneHits(
    outboundHits.get(userId) ?? [],
    WEBHOOK_OUTBOUND_CONFIRM_WINDOW_MS,
    now,
  );
  hits.push(now);
  outboundHits.set(userId, hits);
}

export function resetWebhookAbuseGuardsForTests(): void {
  inboundUserHits.clear();
  outboundHits.clear();
}
