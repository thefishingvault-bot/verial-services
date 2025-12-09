import { requireProvider } from "@/lib/auth-guards";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function ProviderProfilePage() {
  await requireProvider();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Manage your provider profile (coming soon).</p>
      </CardContent>
    </Card>
  );
}
