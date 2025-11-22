import { db } from "@/lib/db";
import { providers, bookings } from "@/db/schema";
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

    // Find all bookings for this provider
    const providerBookings = await db.query.bookings.findMany({
      where: eq(bookings.providerId, provider.id),
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

    return NextResponse.json(providerBookings);

  } catch (error) {
    console.error("[API_PROVIDER_BOOKINGS_LIST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

