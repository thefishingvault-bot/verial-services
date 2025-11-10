import { db } from "@/lib/db";
import { bookings, providers, bookingStatusEnum } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { bookingId, newStatus } = await req.json();
    if (!bookingId || !newStatus) {
      return new NextResponse("Missing bookingId or newStatus", { status: 400 });
    }

    if (!bookingStatusEnum.enumValues.includes(newStatus)) {
      return new NextResponse(`Invalid status: ${newStatus}`, { status: 400 });
    }

    // Get the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });
    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    // Update the booking, *but only if it belongs to this provider*
    const [updatedBooking] = await db.update(bookings)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(
        eq(bookings.id, bookingId),
        eq(bookings.providerId, provider.id) // Security check
      ))
      .returning();

    if (!updatedBooking) {
      return new NextResponse("Booking not found or you do not have permission", { status: 404 });
    }

    console.log(`[API_BOOKING_UPDATE] Provider ${provider.id} updated Booking ${bookingId} to ${newStatus}`);
    return NextResponse.json(updatedBooking);

  } catch (error) {
    console.error("[API_BOOKING_UPDATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

