import { db } from "@/lib/db";
import { bookings, providers, bookingStatusEnum, providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and, or, gte, lte, inArray, ne } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { assertTransition, BookingStatus } from "@/lib/booking-state";
import { stripe } from "@/lib/stripe";
import { getDay } from "date-fns";

export const runtime = "nodejs";

type ProviderAction = "accept" | "decline" | "cancel" | "mark-completed";

const ACTION_TO_STATUS: Record<ProviderAction, BookingStatus> = {
  accept: "accepted",
  decline: "declined",
  cancel: "canceled_provider",
  "mark-completed": "completed",
};

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { bookingId, action, reason } = await req.json();
    if (!bookingId || !action) {
      return new NextResponse("Missing bookingId or action", { status: 400 });
    }

    if (!(action in ACTION_TO_STATUS)) {
      return new NextResponse("Invalid action", { status: 400 });
    }

    const targetStatus = ACTION_TO_STATUS[action as ProviderAction];

    if ((action === "decline" || action === "cancel") && !reason) {
      return new NextResponse("A reason is required to decline or cancel", { status: 400 });
    }

    // Get the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });
    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    // Fetch the booking with context to validate ownership and transition
    const booking = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, bookingId), eq(bookings.providerId, provider.id)),
      with: {
        service: { columns: { title: true } },
      },
      columns: {
        id: true,
        status: true,
        userId: true,
        priceAtBooking: true,
        scheduledDate: true,
        paymentIntentId: true,
      },
    });

    if (!booking) {
      return new NextResponse("Booking not found or you do not have permission", { status: 404 });
    }

    try {
      assertTransition(booking.status as BookingStatus, targetStatus as BookingStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid transition";
      return new NextResponse(message, { status: 400 });
    }

    // If accepting, re-check availability/time-off and overlap, then create PaymentIntent
    let clientSecret: string | undefined;

    if (action === "accept") {
      // Availability + time off validation (defensive re-check)
      if (booking.scheduledDate) {
        const requestedTime = new Date(booking.scheduledDate);
        const dayOfWeekIndex = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ] as const;
        const requestedDay = dayOfWeekIndex[getDay(requestedTime)];

        const providerSchedule = await db.query.providerAvailabilities.findFirst({
          where: and(
            eq(providerAvailabilities.providerId, provider.id),
            eq(providerAvailabilities.dayOfWeek, requestedDay),
            eq(providerAvailabilities.isEnabled, true),
          ),
        });

        if (!providerSchedule) {
          return new NextResponse(`Provider is not available on ${requestedDay}s.`, { status: 400 });
        }

        const requestedTimeStr = requestedTime.toTimeString().substring(0, 5);
        const startTimeStr = providerSchedule.startTime.toString().substring(0, 5);
        const endTimeStr = providerSchedule.endTime.toString().substring(0, 5);

        if (requestedTimeStr < startTimeStr || requestedTimeStr > endTimeStr) {
          return new NextResponse(
            `Provider is only available between ${startTimeStr} and ${endTimeStr} on ${requestedDay}s.`,
            { status: 400 },
          );
        }

        const timeOff = await db.query.providerTimeOffs.findFirst({
          where: and(
            eq(providerTimeOffs.providerId, provider.id),
            lte(providerTimeOffs.startTime, requestedTime),
            gte(providerTimeOffs.endTime, requestedTime),
          ),
        });

        if (timeOff) {
          return new NextResponse(
            `Provider is unavailable on this date for: ${timeOff.reason || "Time Off"}.`,
            { status: 400 },
          );
        }

        // Overlap: prevent another accepted/paid booking at the same slot
        const overlap = await db.query.bookings.findFirst({
          where: and(
            eq(bookings.providerId, provider.id),
            eq(bookings.scheduledDate, booking.scheduledDate),
            inArray(bookings.status, ["accepted", "paid"]),
            ne(bookings.id, booking.id),
          ),
        });

        if (overlap) {
          return new NextResponse("This time slot is no longer available.", { status: 409 });
        }
      }

      // PaymentIntent creation/idempotency
      if (!provider.stripeConnectId) {
        return new NextResponse("Provider payments are not set up.", { status: 400 });
      }

      const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || "1000", 10);
      const applicationFeeAmount = Math.ceil(
        booking.priceAtBooking * (platformFeeBps / 10000),
      );

      const existingPiId = booking.paymentIntentId;
      const idempotencyKey = `pi_accept_${booking.id}`;
      const metadata = {
        bookingId: booking.id,
        userId: booking.userId,
        providerId: provider.id,
      } satisfies Record<string, string>;

      let paymentIntentId = existingPiId;

      if (existingPiId) {
        const pi = await stripe.paymentIntents.retrieve(existingPiId);
        if (pi.status === "requires_payment_method" || pi.status === "requires_confirmation" || pi.status === "requires_action") {
          clientSecret = pi.client_secret || undefined;
        } else if (pi.status === "succeeded") {
          // Already paid, allow transition to paid via webhook
          clientSecret = pi.client_secret || undefined;
        } else {
          // If canceled or otherwise unusable, create a new PI
          paymentIntentId = null;
        }
      }

      if (!paymentIntentId) {
        const pi = await stripe.paymentIntents.create(
          {
            amount: booking.priceAtBooking,
            currency: "nzd",
            automatic_payment_methods: { enabled: true },
            application_fee_amount: applicationFeeAmount,
            transfer_data: { destination: provider.stripeConnectId },
            metadata,
            description: booking.service?.title
              ? `Booking ${booking.id} for ${booking.service.title}`
              : `Booking ${booking.id}`,
            receipt_email: undefined,
          },
          { idempotencyKey },
        );

        paymentIntentId = pi.id;
        clientSecret = pi.client_secret || undefined;
      }

      // Persist status and paymentIntentId together for accept
      const [updated] = await db
        .update(bookings)
        .set({
          status: targetStatus,
          paymentIntentId,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.providerId, provider.id)))
        .returning();

      console.log(`[API_BOOKING_UPDATE] Provider ${provider.id} accepted Booking ${bookingId}`);

      await notifyCustomer({
        bookingId,
        status: targetStatus,
        reason,
        serviceTitle: booking.service?.title,
      });

      return NextResponse.json({ booking: updated, clientSecret });
    }

    // Update the booking after validation (non-accept actions)
    const [updatedBooking] = await db
      .update(bookings)
      .set({ status: targetStatus, updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.providerId, provider.id)))
      .returning();

    console.log(`[API_BOOKING_UPDATE] Provider ${provider.id} updated Booking ${bookingId} to ${targetStatus}`);

    await notifyCustomer({
      bookingId,
      status: targetStatus,
      reason,
      serviceTitle: booking.service?.title,
    });

    return NextResponse.json(updatedBooking);

  } catch (error) {
    console.error("[API_BOOKING_UPDATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

async function notifyCustomer(args: {
  bookingId: string;
  status: BookingStatus;
  reason?: string;
  serviceTitle?: string | null;
}) {
  const { bookingId, status, reason, serviceTitle } = args;

  try {
    const bookingWithUser = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        user: { columns: { id: true, email: true } },
        service: { columns: { title: true } },
      },
    });

    if (!bookingWithUser?.user?.email) return;

    let subject = "";
    let html = "";

    if (status === "accepted") {
      const title = serviceTitle || bookingWithUser.service?.title || "your booking";
      subject = `Your booking for ${title} has been accepted`;
      html = `
        <h1>Booking Accepted</h1>
        <p>Your request for <strong>${title}</strong> has been accepted by the provider.</p>
        <p>Please log in to your dashboard to pay and finalize the booking.</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/bookings">Pay Now</a>
      `;
    } else if (status === "canceled_provider" || status === "declined") {
      const title = serviceTitle || bookingWithUser.service?.title || "your booking";
      subject = `Your booking for ${title} was canceled by the provider`;
      html = `
        <h1>Booking Canceled</h1>
        <p>Your booking request for <strong>${title}</strong> was canceled by the provider.</p>
        ${reason ? `<p>Reason: ${reason}</p>` : ""}
        <p>You have not been charged. You can browse for other services.</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/services">Browse Services</a>
      `;
    } else if (status === "completed") {
      const title = serviceTitle || bookingWithUser.service?.title || "your booking";
      subject = `Your booking for ${title} is complete!`;
      html = `
        <h1>Job Complete!</h1>
        <p>Your job for <strong>${title}</strong> has been marked as complete by the provider.</p>
        <p>Please leave a review to help them and our community.</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/bookings">Leave a Review</a>
      `;
    }

    if (!subject) return;

    await sendEmail({ to: bookingWithUser.user.email, subject, html });

    await createNotification({
      userId: bookingWithUser.user.id,
      message: subject,
      href: "/dashboard/bookings",
    });
  } catch (emailError) {
    console.error("[API_BOOKING_UPDATE] Failed to send notification:", emailError);
  }
}

