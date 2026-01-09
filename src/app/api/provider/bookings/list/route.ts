import { db } from "@/lib/db";
import { providers, bookings } from "@/db/schema";
import { checkBookingsColumnsExist } from "@/lib/booking-schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const requiredColumns = [
      "provider_decline_reason",
      "provider_cancel_reason",
      "provider_message",
      "provider_quoted_price",
    ];

    const schema = await checkBookingsColumnsExist(requiredColumns);
    const missingColumns = schema.ok ? [] : schema.missingColumns;

    if (missingColumns.length) {
      const migrations = new Set<string>();
      if (missingColumns.includes("provider_message") || missingColumns.includes("provider_quoted_price")) {
        migrations.add("0034_provider_booking_messages.sql");
      }
      if (missingColumns.includes("provider_decline_reason") || missingColumns.includes("provider_cancel_reason")) {
        migrations.add("0028_booking_provider_reasons.sql");
      }

      console.warn(
        `[API_PROVIDER_BOOKINGS_LIST] Missing columns ${missingColumns.join(", ")} MIGRATION_REQUIRED ${Array.from(migrations).join(", ")}`,
      );
    }

    // Find all bookings for this provider
    const providerBookings = await db.query.bookings.findMany({
      where: eq(bookings.providerId, provider.id),
      columns: {
        id: true,
        status: true,
        createdAt: true,
        scheduledDate: true,
        priceAtBooking: true,
        providerDeclineReason: !missingColumns.includes("provider_decline_reason"),
        providerCancelReason: !missingColumns.includes("provider_cancel_reason"),
        providerMessage: !missingColumns.includes("provider_message"),
        providerQuotedPrice: !missingColumns.includes("provider_quoted_price"),
      },
      with: {
        service: { columns: { title: true } },
        user: { columns: { firstName: true, lastName: true, email: true } },
        provider: {
          columns: {
            id: true,
            baseSuburb: true,
            baseRegion: true,
            serviceRadiusKm: true,
          },
        },
      },
      orderBy: [desc(bookings.createdAt)],
    });

    // Keep response shape stable even if some columns are missing in the DB.
    const normalized = providerBookings.map((booking) => ({
      ...booking,
      providerDeclineReason:
        (booking as { providerDeclineReason?: string | null }).providerDeclineReason ?? null,
      providerCancelReason:
        (booking as { providerCancelReason?: string | null }).providerCancelReason ?? null,
      providerMessage: (booking as { providerMessage?: string | null }).providerMessage ?? null,
      providerQuotedPrice:
        (booking as { providerQuotedPrice?: number | null }).providerQuotedPrice ?? null,
    }));

    return NextResponse.json(normalized);

  } catch (error) {
    console.error("[API_PROVIDER_BOOKINGS_LIST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

