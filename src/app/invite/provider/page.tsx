import Link from "next/link";
import { eq } from "drizzle-orm";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providerInvites } from "@/db/schema";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const runtime = "nodejs";

function getSearchParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ProviderInvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = getSearchParam(params, "token").trim();
  const error = getSearchParam(params, "error").trim();

  const returnUrl = token ? `/invite/provider?token=${encodeURIComponent(token)}` : "/invite/provider";

  if (!token) {
    return (
      <div className="min-h-screen bg-muted/20">
        <div className="container mx-auto max-w-lg px-4 py-10">
          <Card className="p-6 space-y-3">
            <h1 className="text-2xl font-semibold">Missing invite token</h1>
            <p className="text-sm text-muted-foreground">This invite link is incomplete.</p>
            <Button asChild variant="outline">
              <Link href="/waitlist">Go to waitlist</Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const invite = await db.query.providerInvites.findFirst({
    where: eq(providerInvites.token, token),
    columns: {
      id: true,
      status: true,
      redeemedAt: true,
      redeemedByUserId: true,
    },
  });

  const isRedeemed = Boolean(invite?.redeemedAt || invite?.redeemedByUserId || invite?.status === "redeemed");
  const isRevoked = invite?.status === "revoked";

  if (!invite || isRevoked || isRedeemed) {
    const message =
      error === "revoked"
        ? "This invite has been revoked."
        : error === "redeemed" || isRedeemed
          ? "This invite link has already been used."
          : "This invite link is invalid.";

    return (
      <div className="min-h-screen bg-muted/20">
        <div className="container mx-auto max-w-lg px-4 py-10">
          <Card className="p-6 space-y-3">
            <h1 className="text-2xl font-semibold">Invite unavailable</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild variant="outline">
              <Link href="/waitlist">Go to waitlist</Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const { userId } = await auth();
  const helperErrorText =
    error === "revoked"
      ? "This invite has been revoked."
      : error === "redeemed"
        ? "This invite link has already been used."
        : error === "invalid"
          ? "We couldn't redeem that invite. Please try again."
          : "";

  if (!userId) {
    return (
      <div className="min-h-screen bg-muted/20">
        <div className="container mx-auto max-w-lg px-4 py-10">
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Provider invite</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to redeem your invite and get early provider access.
              </p>
              {helperErrorText ? (
                <p className="text-sm text-destructive">{helperErrorText}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href={`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`}>Sign in to redeem</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/waitlist">Go to waitlist</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto max-w-lg px-4 py-10">
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">You’re invited 🎉</h1>
            <p className="text-sm text-muted-foreground">
              Redeem your invite to unlock provider registration.
            </p>
            {helperErrorText ? (
              <p className="text-sm text-destructive">{helperErrorText}</p>
            ) : null}
          </div>

          <form action={`/invite/provider/redeem?token=${encodeURIComponent(token)}`} method="POST">
            <Button type="submit" className="w-full">
              Redeem invite
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            If you have issues, go back to the waitlist and request a new invite.
          </p>

          <Button asChild variant="outline" className="w-full">
            <Link href="/waitlist">Go to waitlist</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
