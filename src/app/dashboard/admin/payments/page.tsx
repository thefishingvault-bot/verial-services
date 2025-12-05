import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function AdminPaymentsPage() {
  const user = await currentUser();
  if (!user?.id) {
    redirect("/dashboard");
  }

  try {
    await requireAdmin(user.id);
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Payments</h1>
        <p className="text-muted-foreground text-sm">
          Monitor payment flows, investigate charge issues, and reconcile payout activity.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Payments reporting is not available yet. Use the quick links below while we finish this view.
          </p>
          <Separator />
          <div className="space-y-2 text-foreground">
            <div className="font-medium">Quick links</div>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <Link href="/dashboard/admin/revenue-analytics" className="text-blue-600 hover:underline">
                  Revenue analytics
                </Link>
              </li>
              <li>
                <Link href="/dashboard/admin/payout-exceptions" className="text-blue-600 hover:underline">
                  Payout exceptions
                </Link>
              </li>
              <li>
                <Link href="/dashboard/admin/fees" className="text-blue-600 hover:underline">
                  Fees
                </Link>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
