// Tiny in-memory map of per-ticket "next-run overrides" used by the iterate
// (Change more) flow. Lives in its own module to break the cycle between
// review.handlers.ts and RepoWorker.ts.

interface IterateOverride {
  extra: string;
  resumeSessionId: string | null;
}

const overrides = new Map<string, IterateOverride>();

export function setIterateOverride(ticketId: string, v: IterateOverride) {
  overrides.set(ticketId, v);
}

export function takeIterateOverride(
  ticketId: string,
): IterateOverride | undefined {
  const v = overrides.get(ticketId);
  if (v) overrides.delete(ticketId);
  return v;
}
