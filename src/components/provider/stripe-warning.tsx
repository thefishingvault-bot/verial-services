import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function StripeWarning() {
  return (
    <Alert variant="destructive" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1 space-y-1">
        <AlertTitle>Stripe Connect not set up</AlertTitle>
        <AlertDescription>
          Your Stripe Connect payout account is not set up. You cannot receive payouts until
          verification is complete.
        </AlertDescription>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard/provider/profile?connect=stripe">Complete Stripe setup</Link>
      </Button>
    </Alert>
  );
}
