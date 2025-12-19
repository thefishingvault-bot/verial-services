import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { providers, serviceFavorites, services } from "@/db/schema";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isProviderCurrentlySuspended } from "@/lib/suspension";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { serviceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const serviceId = body.serviceId?.trim();
  if (!serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });

  const rate = await enforceRateLimit(req, {
    userId,
    resource: "favorites:toggle",
    limit: 20,
    windowSeconds: 60,
  });

  if (!rate.success) {
    return rateLimitResponse(rate.retryAfter);
  }

  const service = await db.query.services.findFirst({
    where: (s, { eq }) => eq(s.id, serviceId),
    columns: { id: true, providerId: true },
    with: {
      provider: {
        columns: { status: true, isSuspended: true, suspensionStartDate: true, suspensionEndDate: true },
      },
    },
  });

  if (
    !service ||
    !service.provider ||
    service.provider.status !== "approved" ||
    isProviderCurrentlySuspended(service.provider)
  ) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const existing = await db.query.serviceFavorites.findFirst({
    where: (sf, { and, eq }) => and(eq(sf.userId, userId), eq(sf.serviceId, serviceId)),
    columns: { id: true },
  });

  if (existing) {
    await db
      .delete(serviceFavorites)
      .where(and(eq(serviceFavorites.userId, userId), eq(serviceFavorites.serviceId, serviceId)));
  } else {
    await db
      .insert(serviceFavorites)
      .values({ userId, serviceId })
      .onConflictDoNothing();
  }

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(serviceFavorites)
    .where(eq(serviceFavorites.serviceId, serviceId));

  const finalFavorite = await db.query.serviceFavorites.findFirst({
    where: (sf, { and, eq }) => and(eq(sf.userId, userId), eq(sf.serviceId, serviceId)),
    columns: { id: true },
  });

  const isFavorited = Boolean(finalFavorite);
  const count = Number(countRow?.count ?? 0);

  return NextResponse.json({ isFavorited, count });
}
