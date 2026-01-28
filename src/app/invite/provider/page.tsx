import Link from "next/link";
import { redirect } from "next/navigation";
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
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`);
  }

  redirect(`/invite/provider/redeem?token=${encodeURIComponent(token)}`);
}
