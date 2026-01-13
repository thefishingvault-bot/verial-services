import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ProviderAccessState } from "@/lib/provider-access";

function formatDateTime(value: Date) {
  try {
    return value.toLocaleString("en-NZ", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value.toISOString();
  }
}

export function ProviderSuspensionBanner({
  state,
}: {
  state: ProviderAccessState | null;
}) {
  if (!state || state.status !== "limited") return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4">
      <Card className="border-destructive/30 bg-muted/30 py-4 shadow-none">
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">Limited mode</Badge>
            <div className="text-sm font-medium">
              You can view your dashboard, but new business actions are blocked.
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {state.reason ? (
              <span>
                Reason: <span className="text-foreground">{state.reason}</span>
              </span>
            ) : (
              <span>Reason: <span className="text-foreground">No reason provided</span></span>
            )}
            {" · "}
            <span>
              Ends: <span className="text-foreground">{state.endsAt ? formatDateTime(state.endsAt) : "Indefinite"}</span>
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            Blocked: create/update/publish services, change availability, accept new bookings, payouts/onboarding actions.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
