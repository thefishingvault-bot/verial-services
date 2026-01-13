import { formatPenalty, normalizePenaltyPoints } from "@/lib/format/penalty";

export function PenaltyText({ points }: { points: unknown }) {
  const normalized = normalizePenaltyPoints(points);
  if (normalized === 0) {
    return <span className="text-muted-foreground">0</span>;
  }

  return <span className="text-red-600 font-medium">{formatPenalty(normalized)}</span>;
}
