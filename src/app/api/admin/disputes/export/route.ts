import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { disputes, bookings, providers, services } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";

function escapeCsv(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[\r\n",]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "all").trim();
    const type = (url.searchParams.get("type") || "all").trim();
    const search = (url.searchParams.get("search") || "").trim();

    const whereConditions: Array<ReturnType<typeof sql>> = [];

    if (status !== "all") {
      whereConditions.push(sql`${disputes.status} = ${status}`);
    }

    if (type !== "all") {
      whereConditions.push(sql`${disputes.initiatorType} = ${type}`);
    }

    if (search) {
      whereConditions.push(
        sql`(${providers.businessName} ilike ${`%${search}%`} or ${services.title} ilike ${`%${search}%`} or ${disputes.description} ilike ${`%${search}%`} or ${disputes.reason} ilike ${`%${search}%`})`,
      );
    }

    const where = whereConditions.length ? and(...whereConditions) : undefined;

    const rows = await db
      .select({
        id: disputes.id,
        status: disputes.status,
        initiatorType: disputes.initiatorType,
        reason: disputes.reason,
        amountDisputed: disputes.amountDisputed,
        refundAmount: disputes.refundAmount,
        createdAt: disputes.createdAt,
        resolvedAt: disputes.resolvedAt,
        bookingId: disputes.bookingId,
        providerName: providers.businessName,
        serviceTitle: services.title,
      })
      .from(disputes)
      .innerJoin(bookings, eq(disputes.bookingId, bookings.id))
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .innerJoin(services, eq(bookings.serviceId, services.id))
      .where(where)
      .orderBy(desc(disputes.createdAt))
      .limit(5000);

    const header = [
      "dispute_id",
      "status",
      "initiator_type",
      "reason",
      "amount_disputed_cents",
      "refund_amount_cents",
      "created_at",
      "resolved_at",
      "booking_id",
      "provider",
      "service",
    ];

    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.status,
          r.initiatorType,
          r.reason,
          r.amountDisputed ?? "",
          r.refundAmount ?? "",
          r.createdAt?.toISOString?.() ?? "",
          r.resolvedAt?.toISOString?.() ?? "",
          r.bookingId,
          r.providerName,
          r.serviceTitle,
        ]
          .map(escapeCsv)
          .join(","),
      );
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="disputes_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting disputes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
