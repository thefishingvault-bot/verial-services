import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bookings } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { bookingId } = await params;
  if (!bookingId) {
    return new NextResponse("Missing bookingId", { status: 400 });
  }

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
    with: {
      service: { columns: { title: true, slug: true } },
      provider: {
        columns: {
          id: true,
          businessName: true,
          handle: true,
          stripeConnectId: true,
          baseRegion: true,
          baseSuburb: true,
          serviceRadiusKm: true,
        },
        with: {
          user: { columns: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!booking) {
    return new NextResponse("Booking not found", { status: 404 });
  }

  return NextResponse.json({ booking });
}
