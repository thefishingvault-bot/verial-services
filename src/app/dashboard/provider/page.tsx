import { requireProvider } from "@/lib/auth-guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProviderDashboardPage() {
  await requireProvider();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Check your bookings and calendar to stay on top of requests.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            <li>Review new booking requests.</li>
            <li>Update your availability and services.</li>
            <li>Check earnings and notifications.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
