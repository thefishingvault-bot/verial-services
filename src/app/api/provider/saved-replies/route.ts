import crypto from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { normalizeProviderPlan } from "@/lib/provider-subscription";
import { providerSavedReplies, providers } from "@/db/schema";

export const runtime = "nodejs";

function isProOrElite(plan: ReturnType<typeof normalizeProviderPlan>) {
  return plan === "pro" || plan === "elite";
}

export async function GET() {
  try {
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

    const rows = await db
      .select({
        id: providerSavedReplies.id,
        title: providerSavedReplies.title,
        body: providerSavedReplies.body,
        createdAt: providerSavedReplies.createdAt,
        updatedAt: providerSavedReplies.updatedAt,
      })
      .from(providerSavedReplies)
      .where(eq(providerSavedReplies.providerId, provider.id))
      .orderBy(desc(providerSavedReplies.updatedAt));

    return NextResponse.json({ plan, replies: rows });
  } catch (error) {
    console.error("[API_PROVIDER_SAVED_REPLIES_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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
    const title = typeof (body as any)?.title === "string" ? (body as any).title.trim() : "";
    const replyBody = typeof (body as any)?.body === "string" ? (body as any).body.trim() : "";

    if (!title || title.length > 120) {
      return NextResponse.json({ error: "invalid_title" }, { status: 400 });
    }
    if (!replyBody || replyBody.length > 2000) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const now = new Date();
    const id = `psr_${crypto.randomUUID()}`;

    await db.insert(providerSavedReplies).values({
      id,
      providerId: provider.id,
      title,
      body: replyBody,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      id,
      title,
      body: replyBody,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("[API_PROVIDER_SAVED_REPLIES_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
