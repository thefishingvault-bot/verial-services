import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { normalizeProviderPlan } from "@/lib/provider-subscription";
import { providerSavedReplies, providers } from "@/db/schema";

export const runtime = "nodejs";

function isProOrElite(plan: ReturnType<typeof normalizeProviderPlan>) {
  return plan === "pro" || plan === "elite";
}

export async function PATCH(request: Request, ctx: { params: Promise<{ replyId: string }> }) {
  try {
    const { replyId } = await ctx.params;

    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { id: true, plan: true },
    });

    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const plan = normalizeProviderPlan(provider.plan);
    if (!isProOrElite(plan)) {
      return NextResponse.json(
        { error: "upgrade_required", message: "Upgrade to Pro to use saved replies." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const titleRaw = typeof (body as any)?.title === "string" ? (body as any).title.trim() : null;
    const bodyRaw = typeof (body as any)?.body === "string" ? (body as any).body.trim() : null;

    if (titleRaw !== null && (!titleRaw || titleRaw.length > 120)) {
      return NextResponse.json({ error: "invalid_title" }, { status: 400 });
    }
    if (bodyRaw !== null && (!bodyRaw || bodyRaw.length > 2000)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const updates: Partial<typeof providerSavedReplies.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (titleRaw !== null) updates.title = titleRaw;
    if (bodyRaw !== null) updates.body = bodyRaw;

    await db
      .update(providerSavedReplies)
      .set(updates)
      .where(and(eq(providerSavedReplies.id, replyId), eq(providerSavedReplies.providerId, provider.id)));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[API_PROVIDER_SAVED_REPLIES_PATCH]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ replyId: string }> }) {
  try {
    const { replyId } = await ctx.params;

    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
      columns: { id: true, plan: true },
    });

    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const plan = normalizeProviderPlan(provider.plan);
    if (!isProOrElite(plan)) {
      return NextResponse.json(
        { error: "upgrade_required", message: "Upgrade to Pro to use saved replies." },
        { status: 403 },
      );
    }

    await db
      .delete(providerSavedReplies)
      .where(and(eq(providerSavedReplies.id, replyId), eq(providerSavedReplies.providerId, provider.id)));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[API_PROVIDER_SAVED_REPLIES_DELETE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
