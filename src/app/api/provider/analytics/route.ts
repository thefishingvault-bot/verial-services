import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { normalizeProviderPlan } from "@/lib/provider-subscription";
import { bookings, providerEarnings, providers, services } from "@/db/schema";

export const runtime = "nodejs";

function requireProOrElite(plan: ReturnType<typeof normalizeProviderPlan>) {
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
    if (!requireProOrElite(plan)) {
      return NextResponse.json(
        { error: "upgrade_required", message: "Upgrade to Pro to access advanced analytics." },
        { status: 403 },
      );
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [bookingCounts, earningsRow, topServices] = await Promise.all([
      db
        .select({
          status: bookings.status,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.providerId, provider.id),
            gte(bookings.createdAt, thirtyDaysAgo),
            inArray(bookings.status, [
              "pending",
              "accepted",
              "declined",
              "paid",
              "completed",
              "canceled_customer",
              "canceled_provider",
            ]),
          ),
        )
        .groupBy(bookings.status),
      db
        .select({
          gross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
          fee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
          gst: sql<number>`coalesce(sum(${providerEarnings.gstAmount}), 0)`,
          net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
        })
        .from(providerEarnings)
        .where(and(eq(providerEarnings.providerId, provider.id), gte(providerEarnings.createdAt, thirtyDaysAgo)))
        .then((rows) => rows[0]),
      db
        .select({
          serviceId: services.id,
          title: services.title,
          completedCount: sql<number>`cast(count(*) as int)`,
        })
        .from(bookings)
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .where(
          and(
            eq(bookings.providerId, provider.id),
            eq(bookings.status, "completed"),
            gte(bookings.createdAt, thirtyDaysAgo),
          ),
        )
        .groupBy(services.id, services.title)
        .orderBy(desc(sql`cast(count(*) as int)`))
        .limit(5),
    ]);

    const counts: Record<string, number> = {};
    bookingCounts.forEach((row) => {
      counts[row.status ?? "unknown"] = Number(row.count ?? 0);
    });

    return NextResponse.json({
      plan,
      windowDays: 30,
      bookings: {
        countsByStatus: counts,
      },
      earnings: {
        gross: Number(earningsRow?.gross ?? 0),
        fee: Number(earningsRow?.fee ?? 0),
        gst: Number(earningsRow?.gst ?? 0),
        net: Number(earningsRow?.net ?? 0),
      },
      topServices: topServices.map((s) => ({
        serviceId: s.serviceId,
        title: s.title,
        completedCount: Number(s.completedCount ?? 0),
      })),
    });
  } catch (error) {
    console.error("[API_PROVIDER_ANALYTICS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
