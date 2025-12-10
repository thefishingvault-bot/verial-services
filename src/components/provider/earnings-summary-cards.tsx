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
      label: "Lifetime earnings",
      value: lifetimeNet,
      hint: "Net after fees and GST",
    },
    {
      label: "Last 30 days",
      value: last30Net,
      hint: "Recent net earnings",
    },
    {
      label: "Pending payouts",
      value: pendingNet,
      hint: "Awaiting transfer",
    },
    {
      label: "Completed payouts",
      value: completedNet,
      hint: "Already paid out",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="space-y-1 pb-2">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <CardTitle className="text-2xl">
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
