import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bookingReschedules, bookings, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });

  if (!provider) {
    return new NextResponse("Provider not found", { status: 404 });
  }

  const { bookingId } = await params;
  if (!bookingId) {
    return new NextResponse("Missing bookingId", { status: 400 });
  }

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.providerId, provider.id)),
    with: {
      user: { columns: { id: true, firstName: true, lastName: true, email: true } },
      service: { columns: { title: true, slug: true, region: true, suburb: true } },
      provider: {
        columns: {
          id: true,
          businessName: true,
          handle: true,
          stripeConnectId: true,
        },
      },
    },
  });

  if (!booking) {
    return new NextResponse("Booking not found", { status: 404 });
  }

  const pendingReschedule = await db.query.bookingReschedules.findFirst({
    where: and(eq(bookingReschedules.bookingId, booking.id), eq(bookingReschedules.status, "pending")),
    columns: {
      id: true,
      status: true,
      proposedDate: true,
      customerNote: true,
      providerNote: true,
      requesterId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [desc(bookingReschedules.createdAt)],
  });

  return NextResponse.json({ booking, pendingReschedule });
}
