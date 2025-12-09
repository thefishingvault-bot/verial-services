import { requireProvider } from "@/lib/auth-guards";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function ProviderEarningsPage() {
  await requireProvider();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Earnings</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">View payouts and earnings (coming soon).</p>
      </CardContent>
    </Card>
  );
}
