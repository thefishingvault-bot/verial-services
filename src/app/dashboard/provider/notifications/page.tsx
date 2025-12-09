import { requireProvider } from "@/lib/auth-guards";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function ProviderNotificationsPage() {
  await requireProvider();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Provider notifications (coming soon).</p>
      </CardContent>
    </Card>
  );
}
