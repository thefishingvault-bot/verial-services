import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, between, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { providerEarnings, providerPayouts, providers } from "@/db/schema";
import type { ProviderTaxDocResponse } from "@/types/tax";

export const runtime = "nodejs";

const ELIGIBLE_EARNINGS_STATUSES = ["awaiting_payout", "paid_out"] as const;

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

    if (Number.isNaN(year)) {
      return new NextResponse("Invalid year", { status: 400 });
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const totals = await db
      .select({
        gross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
        fee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
        gst: sql<number>`coalesce(sum(${providerEarnings.gstAmount}), 0)`,
        net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
      })
      .from(providerEarnings)
      .where(
        and(
          eq(providerEarnings.providerId, provider.id),
          between(providerEarnings.paidAt, start, end),
          inArray(providerEarnings.status, ELIGIBLE_EARNINGS_STATUSES),
        ),
      )
      .then((rows) => rows[0]);

    const monthly = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${providerEarnings.paidAt}), 'YYYY-MM')`,
        gross: sql<number>`coalesce(sum(${providerEarnings.grossAmount}), 0)`,
        fee: sql<number>`coalesce(sum(${providerEarnings.platformFeeAmount}), 0)`,
        gst: sql<number>`coalesce(sum(${providerEarnings.gstAmount}), 0)`,
        net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
      })
      .from(providerEarnings)
      .where(
        and(
          eq(providerEarnings.providerId, provider.id),
          between(providerEarnings.paidAt, start, end),
          inArray(providerEarnings.status, ELIGIBLE_EARNINGS_STATUSES),
        ),
      )
      .groupBy(sql`date_trunc('month', ${providerEarnings.paidAt})`)
      .orderBy(sql`date_trunc('month', ${providerEarnings.paidAt})`);

    const payouts = await db
      .select({
        id: providerPayouts.id,
        amount: providerPayouts.amount,
        status: providerPayouts.status,
        arrivalDate: providerPayouts.arrivalDate,
      })
      .from(providerPayouts)
      .where(
        and(
          eq(providerPayouts.providerId, provider.id),
          between(providerPayouts.arrivalDate, start, end),
        ),
      )
      .orderBy(providerPayouts.arrivalDate);

    const payoutsReceived = payouts
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0);

    const outstanding = await db
      .select({
        net: sql<number>`coalesce(sum(${providerEarnings.netAmount}), 0)`,
      })
      .from(providerEarnings)
      .where(
        and(
          eq(providerEarnings.providerId, provider.id),
          between(providerEarnings.paidAt, start, end),
          eq(providerEarnings.status, "awaiting_payout"),
        ),
      )
      .then((rows) => rows[0]?.net ?? 0);

    const response: ProviderTaxDocResponse = {
      providerId: provider.id,
      businessName: provider.businessName,
      chargesGst: provider.chargesGst,
      year,
      totals: {
        gross: totals?.gross ?? 0,
        fee: totals?.fee ?? 0,
        gst: totals?.gst ?? 0,
        net: totals?.net ?? 0,
        payoutsReceived,
        outstandingNet: outstanding,
      },
      monthly,
      payouts: payouts.map((p) => ({
        ...p,
        arrivalDate: p.arrivalDate ? p.arrivalDate.toISOString() : null,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API_PROVIDER_EARNINGS_TAX_DOC]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
