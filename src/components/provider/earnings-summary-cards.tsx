import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils";

type EarningsSummaryCardsProps = {
  currency: string;
  lifetimeNet: number;
  last30Net: number;
  pendingNet: number;
  completedNet: number;
  loading?: boolean;
};

export function EarningsSummaryCards({
  currency,
  lifetimeNet,
  last30Net,
  pendingNet,
  completedNet,
  loading,
}: EarningsSummaryCardsProps) {
  const items = [
    {
      label: "Lifetime earned (net)",
      value: lifetimeNet,
      hint: "Net after platform fees (and GST if applicable)",
    },
    {
      label: "Earned (last 30 days)",
      value: last30Net,
      hint: "Net earned in the last 30 days.",
    },
    {
      label: "Pending payout",
      value: pendingNet,
      hint: "Earned, not paid out to your bank yet.",
    },
    {
      label: "Paid out",
      value: completedNet,
      hint: "Transferred to your bank.",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="space-y-1 pb-2">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <CardTitle className="text-xl sm:text-2xl">
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                formatPrice(item.value, currency)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
