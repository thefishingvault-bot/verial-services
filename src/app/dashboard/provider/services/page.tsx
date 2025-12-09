import { requireProvider } from "@/lib/auth-guards";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function ProviderServicesPage() {
  await requireProvider();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Manage your services. (Coming soon)</p>
      </CardContent>
    </Card>
  );
}
