import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, providers, services, users } from "@/db/schema";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
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
    const search = (url.searchParams.get("search") || "").trim();

    const whereConditions: Array<ReturnType<typeof sql>> = [];

    const canceledStatuses = ["canceled_customer", "canceled_provider"] as const;

    if (status !== "all") {
      if (status === "canceled") {
        whereConditions.push(sql`${bookings.status} in ('canceled_customer','canceled_provider')`);
      } else if (canceledStatuses.includes(status as any)) {
        whereConditions.push(sql`${bookings.status} = ${status}`);
      } else {
        whereConditions.push(sql`${bookings.status} = ${status === "confirmed" ? "accepted" : status}`);
      }
    }

    if (search) {
      whereConditions.push(
        sql`(${bookings.id} ilike ${`%${search}%`} or ${users.firstName} ilike ${`%${search}%`} or ${users.lastName} ilike ${`%${search}%`} or ${users.email} ilike ${`%${search}%`} or ${providers.businessName} ilike ${`%${search}%`} or ${providers.handle} ilike ${`%${search}%`} or ${services.title} ilike ${`%${search}%`})`,
      );
    }

    const rows = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        scheduledDate: bookings.scheduledDate,
        priceAtBooking: bookings.priceAtBooking,
        paymentIntentId: bookings.paymentIntentId,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        customerFirstName: users.firstName,
        customerLastName: users.lastName,
        customerEmail: users.email,
        providerBusinessName: providers.businessName,
        providerHandle: providers.handle,
        serviceTitle: services.title,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userId, users.id))
      .leftJoin(providers, eq(bookings.providerId, providers.id))
      .leftJoin(services, eq(bookings.serviceId, services.id))
      .where(whereConditions.length ? and(...(whereConditions as any)) : undefined)
      .orderBy(desc(bookings.createdAt))
      .limit(5000);

    const header = [
      "booking_id",
      "status",
      "scheduled_date",
      "amount_cents",
      "payment_intent_id",
      "created_at",
      "updated_at",
      "customer_first_name",
      "customer_last_name",
      "customer_email",
      "provider",
      "provider_handle",
      "service",
    ];

    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.status,
          r.scheduledDate?.toISOString?.() ?? "",
          r.priceAtBooking ?? "",
          r.paymentIntentId ?? "",
          r.createdAt?.toISOString?.() ?? "",
          r.updatedAt?.toISOString?.() ?? "",
          r.customerFirstName ?? "",
          r.customerLastName ?? "",
          r.customerEmail ?? "",
          r.providerBusinessName ?? "",
          r.providerHandle ?? "",
          r.serviceTitle ?? "",
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
        "Content-Disposition": `attachment; filename="bookings_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting bookings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
