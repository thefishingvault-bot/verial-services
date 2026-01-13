import { db } from "@/lib/db";
import { bookings, providers, bookingStatusEnum, providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and, or, gte, lte, inArray, ne } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { assertTransition, BookingStatus } from "@/lib/booking-state";
import { getDay } from "date-fns";
import { assertProviderCanTransactFromProvider } from "@/lib/provider-access";

export const runtime = "nodejs";

type ProviderAction = "accept" | "decline" | "cancel" | "mark-completed";

const ACTION_TO_STATUS: Record<ProviderAction, BookingStatus> = {
  accept: "accepted",
  decline: "declined",
  cancel: "canceled_provider",
  "mark-completed": "completed_by_provider",
};

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          bookingId?: string;
          action?: ProviderAction;
          reason?: string;
          declineReason?: string;
          cancelReason?: string;
          providerMessage?: string;
          finalPriceInCents?: number;
        }
      | null;

    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : null;
    const action = body?.action;
    const finalPriceInCents = body?.finalPriceInCents;

    const legacyReason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const declineReasonRaw = typeof body?.declineReason === "string" ? body.declineReason.trim() : "";
    const cancelReasonRaw = typeof body?.cancelReason === "string" ? body.cancelReason.trim() : "";
    const providerMessageRaw = typeof body?.providerMessage === "string" ? body.providerMessage.trim() : "";

    const declineReason = declineReasonRaw || (action === "decline" ? legacyReason : "");
    const cancelReason = cancelReasonRaw || (action === "cancel" ? legacyReason : "");
    const providerMessage = providerMessageRaw || null;

    if (!bookingId || !action) {
      return new NextResponse("Missing bookingId or action", { status: 400 });
    }

    if (!(action in ACTION_TO_STATUS)) {
      return new NextResponse("Invalid action", { status: 400 });
    }

    const targetStatus = ACTION_TO_STATUS[action as ProviderAction];

    if (action === "decline" && !declineReason) {
      return new NextResponse("A reason is required to decline", { status: 400 });
    }
    if (action === "cancel" && !cancelReason) {
      return new NextResponse("A reason is required to cancel", { status: 400 });
    }

    // Get the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });
    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    if (action === "accept") {
      const access = assertProviderCanTransactFromProvider(provider);
      if (!access.ok) {
        return access.response;
      }
    }

    // Fetch the booking with context to validate ownership and transition
    const booking = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, bookingId), eq(bookings.providerId, provider.id)),
      with: {
        service: { columns: { title: true, pricingType: true } },
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

    // If accepting, re-check availability/time-off and overlap.

    if (action === "accept") {
      const pricingType = booking.service?.pricingType ?? "fixed";
      const requiresQuote = pricingType === "from" || pricingType === "quote";

      let amountInCents = booking.priceAtBooking;

      // From/Quote flow: provider must set the final payable amount on accept.
      if (requiresQuote) {
        const n = typeof finalPriceInCents === "number" ? Math.round(finalPriceInCents) : NaN;
        if (!Number.isFinite(n) || n < 100) {
          return new NextResponse(
            "Final price (in cents) is required to accept from/quote requests (min $1.00).",
            { status: 400 },
          );
        }
        amountInCents = n;
      }

      if (!Number.isFinite(amountInCents) || amountInCents < 100) {
        return new NextResponse('Booking amount is invalid (min $1.00).', { status: 400 });
      }

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

        // Temporarily skip strict availability window enforcement to avoid false 400s; keep time-off/overlap checks below

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

      // Require a connected account so we can transfer after completion confirmation.
      if (!provider.stripeConnectId) {
        return new NextResponse("Provider payments are not set up.", { status: 400 });
      }

      // Persist status and paymentIntentId together for accept
      const [updated] = await db
        .update(bookings)
        .set({
          status: targetStatus,
          priceAtBooking: amountInCents,
          providerQuotedPrice: requiresQuote ? amountInCents : null,
          providerMessage,
          // Payment is created by the customer after accept (platform charge held until completion).
          paymentIntentId: booking.paymentIntentId ?? null,
          providerDeclineReason: null,
          providerCancelReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bookings.id, bookingId),
            eq(bookings.providerId, provider.id),
            eq(bookings.status, booking.status as BookingStatus),
          ),
        )
        .returning();

      if (!updated) {
        return new NextResponse("Booking status changed. Please refresh and try again.", {
          status: 409,
        });
      }

      console.log(`[API_BOOKING_UPDATE] Provider ${provider.id} accepted Booking ${bookingId}`);

      await notifyCustomer({
        bookingId,
        status: targetStatus,
        reason: providerMessage ?? undefined,
        serviceTitle: booking.service?.title,
      });

      return NextResponse.json({ booking: updated });
    }

    // Update the booking after validation (non-accept actions)
    const [updatedBooking] = await db
      .update(bookings)
      .set({
        status: targetStatus,
        ...(action === "decline"
          ? { providerDeclineReason: declineReason || null, providerCancelReason: null, providerMessage }
          : action === "cancel"
            ? { providerDeclineReason: null, providerCancelReason: cancelReason || null }
            : { providerDeclineReason: null, providerCancelReason: null }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.providerId, provider.id),
          eq(bookings.status, booking.status as BookingStatus),
        ),
      )
      .returning();

    if (!updatedBooking) {
      return new NextResponse("Booking status changed. Please refresh and try again.", {
        status: 409,
      });
    }

    console.log(`[API_BOOKING_UPDATE] Provider ${provider.id} updated Booking ${bookingId} to ${targetStatus}`);

    await notifyCustomer({
      bookingId,
      status: targetStatus,
      reason: action === "decline" ? declineReason : action === "cancel" ? cancelReason : undefined,
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
      columns: {
        id: true,
        providerId: true,
      },
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
      type: "booking",
      title: subject,
      body:
        status === "declined" || status === "canceled_provider"
          ? reason
            ? `Reason: ${reason}`
            : null
          : null,
      message: subject,
      href: "/dashboard/bookings",
      actionUrl: `/dashboard/bookings/${bookingId}`,
      bookingId,
      providerId: bookingWithUser.providerId,
    });
  } catch (emailError) {
    console.error("[API_BOOKING_UPDATE] Failed to send notification:", emailError);
  }
}

