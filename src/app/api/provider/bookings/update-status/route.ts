import { db } from "@/lib/db";
import { bookings, providers, bookingStatusEnum } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

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

    // --- Send Notification Email to Customer ---
    try {
      // Get the customer's email
      const bookingWithUser = await db.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: {
          user: { columns: { email: true } },
          service: { columns: { title: true } }
        }
      });

      if (bookingWithUser?.user?.email) {
        let subject = '';
        let html = '';

        if (newStatus === 'confirmed') {
          subject = `Your booking for ${bookingWithUser.service.title} is confirmed!`;
          html = `
            <h1>Booking Confirmed!</h1>
            <p>Your request for <strong>${bookingWithUser.service.title}</strong> has been accepted by the provider.</p>
            <p>Please log in to your dashboard to pay and finalize the booking.</p>
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/bookings">Pay Now</a>
          `;
        } else if (newStatus === 'canceled') {
          subject = `Your booking for ${bookingWithUser.service.title} was canceled`;
          html = `
            <h1>Booking Canceled</h1>
            <p>Your booking request for <strong>${bookingWithUser.service.title}</strong> was canceled by the provider.</p>
            <p>You have not been charged. You can browse for other services.</p>
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/services">Browse Services</a>
          `;
        }

        if (subject) {
          await sendEmail({
            to: bookingWithUser.user.email,
            subject: subject,
            html: html,
          });
        }
      }
    } catch (emailError) {
      console.error(`[API_BOOKING_UPDATE] Failed to send email:`, emailError);
    }

    return NextResponse.json(updatedBooking);

  } catch (error) {
    console.error("[API_BOOKING_UPDATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

