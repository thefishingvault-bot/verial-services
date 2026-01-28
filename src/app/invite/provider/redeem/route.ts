import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providerInvites, users } from "@/db/schema";
import { ensureUserExistsInDb } from "@/lib/user-sync";

export const runtime = "nodejs";

const EARLY_ACCESS_COOKIE = "verial_early_provider_access";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.redirect(new URL("/waitlist", request.url));
  }

  const { userId } = await auth();
  if (!userId) {
    const redirectUrl = `/invite/provider?token=${encodeURIComponent(token)}`;
    return NextResponse.redirect(new URL(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`, request.url));
  }

  // Ensure local DB user exists so we can set earlyProviderAccess.
  await ensureUserExistsInDb(userId, "user");

  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const [updatedInvite] = await tx
        .update(providerInvites)
        .set({
          status: "redeemed",
          redeemedAt: now,
          redeemedByUserId: userId,
        })
        .where(and(eq(providerInvites.token, token), eq(providerInvites.status, "pending")))
        .returning({ id: providerInvites.id });

      if (!updatedInvite) {
        return { ok: false as const };
      }

      await tx
        .update(users)
        .set({ earlyProviderAccess: true, updatedAt: now })
        .where(eq(users.id, userId));

      return { ok: true as const };
    });

    if (!result.ok) {
      const url = new URL("/invite/provider", request.url);
      url.searchParams.set("token", token);
      url.searchParams.set("error", "redeemed");
      return NextResponse.redirect(url);
    }

    const res = NextResponse.redirect(new URL("/dashboard/register-provider", request.url));
    res.cookies.set({
      name: EARLY_ACCESS_COOKIE,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return res;
  } catch (error) {
    console.error("[INVITE_PROVIDER_REDEEM]", error);
    const url = new URL("/invite/provider", request.url);
    url.searchParams.set("token", token);
    url.searchParams.set("error", "invalid");
    return NextResponse.redirect(url);
  }
}
