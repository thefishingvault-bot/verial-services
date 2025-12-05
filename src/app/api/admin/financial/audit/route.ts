import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, providerEarnings, providers, services } from "@/db/schema";
import { calculateEarnings } from "@/lib/earnings";
import { logFinancialAudit } from "@/lib/financial-consistency";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || "1000", 10);
const GST_BPS = parseInt(process.env.GST_BPS || "1500", 10);

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    await requireAdmin(userId);

    let issues = 0;

    // 1) Paid bookings without earnings rows
    const missingEarnings = await db
      .select({ bookingId: bookings.id, providerId: bookings.providerId, price: bookings.priceAtBooking })
      .from(bookings)
      .leftJoin(providerEarnings, eq(bookings.id, providerEarnings.bookingId))
      .where(and(eq(bookings.status, "paid"), isNull(providerEarnings.id)));

    for (const row of missingEarnings) {
      issues++;
      await logFinancialAudit({
        providerId: row.providerId,
        bookingId: row.bookingId,
        issue: "missing_earning_row_for_paid_booking",
        expectedValue: "earning row present",
        actualValue: "none",
      });
    }

    // 2) Validate earnings math and KYC/GST constraints
    const earnings = await db
      .select({
        id: providerEarnings.id,
        bookingId: providerEarnings.bookingId,
        providerId: providerEarnings.providerId,
        grossAmount: providerEarnings.grossAmount,
        platformFeeAmount: providerEarnings.platformFeeAmount,
        gstAmount: providerEarnings.gstAmount,
        netAmount: providerEarnings.netAmount,
        status: providerEarnings.status,
        providerChargesGst: providers.chargesGst,
        kycStatus: providers.kycStatus,
        bookingPrice: bookings.priceAtBooking,
        serviceChargesGst: services.chargesGst,
      })
      .from(providerEarnings)
      .leftJoin(bookings, eq(bookings.id, providerEarnings.bookingId))
      .leftJoin(providers, eq(providers.id, providerEarnings.providerId))
      .leftJoin(services, eq(services.id, providerEarnings.serviceId));

    for (const row of earnings) {
      const chargesGst = row.serviceChargesGst ?? row.providerChargesGst ?? true;
      const expected = calculateEarnings({
        amountInCents: row.bookingPrice ?? row.grossAmount,
        chargesGst,
        platformFeeBps: PLATFORM_FEE_BPS,
        gstBps: GST_BPS,
      });

      // Platform fee check
      if (expected.platformFeeAmount !== row.platformFeeAmount) {
        issues++;
        await logFinancialAudit({
          providerId: row.providerId,
          bookingId: row.bookingId,
          issue: "platform_fee_mismatch",
          expectedValue: String(expected.platformFeeAmount),
          actualValue: String(row.platformFeeAmount),
        });
      }

      // GST check
      if (expected.gstAmount !== row.gstAmount) {
        issues++;
        await logFinancialAudit({
          providerId: row.providerId,
          bookingId: row.bookingId,
          issue: "gst_mismatch",
          expectedValue: String(expected.gstAmount),
          actualValue: String(row.gstAmount),
        });
      }

      // Net check and negative guard
      const expectedNet = expected.netAmount;
      if (expectedNet !== row.netAmount || row.netAmount < 0) {
        issues++;
        await logFinancialAudit({
          providerId: row.providerId,
          bookingId: row.bookingId,
          issue: "net_mismatch_or_negative",
          expectedValue: String(expectedNet),
          actualValue: String(row.netAmount),
        });
      }

      // KYC enforcement: earnings should not be paid out if KYC incomplete
      if (row.kycStatus !== "verified" && (row.status === "awaiting_payout" || row.status === "paid_out")) {
        issues++;
        await logFinancialAudit({
          providerId: row.providerId,
          bookingId: row.bookingId,
          issue: "kyc_not_verified_for_earning",
          expectedValue: "kyc verified",
          actualValue: row.kycStatus,
        });
      }
    }

    return NextResponse.json({ issuesLogged: issues });
  } catch (error) {
    console.error("[API_ADMIN_FINANCIAL_AUDIT]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
