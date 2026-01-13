export function normalizePenaltyPoints(points: unknown): number {
  const asNumber = typeof points === "number" ? points : Number(points);
  if (!Number.isFinite(asNumber)) return 0;
  return Math.max(0, Math.trunc(asNumber));
}

export function formatPenalty(points: unknown): string {
  const normalized = normalizePenaltyPoints(points);
  if (normalized === 0) return "0";
  return `Deduct ${normalized}`;
}
