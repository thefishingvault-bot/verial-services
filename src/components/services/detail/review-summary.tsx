export type ReviewBreakdown = Record<string, number>;

interface ReviewSummaryProps {
  averageRating: number;
  totalReviews: number;
  breakdown: ReviewBreakdown;
}

export function ReviewSummary({ averageRating, totalReviews, breakdown }: ReviewSummaryProps) {
  const stars = [5, 4, 3, 2, 1];
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-4xl font-bold text-slate-900">{averageRating.toFixed(1)}</div>
        <div className="text-sm text-slate-600">
          <div className="font-semibold">Customer rating</div>
          <div>{totalReviews} review{totalReviews === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div className="space-y-2">
        {stars.map((star) => {
          const count = breakdown[String(star)] ?? 0;
          const percent = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-3 text-sm text-slate-700">
              <span className="w-10 text-right font-medium">{star}★</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${percent}%` }}
                  aria-hidden
                />
              </div>
              <span className="w-10 text-right text-xs text-slate-500">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
