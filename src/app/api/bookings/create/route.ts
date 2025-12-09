import { db } from "@/lib/db";
import { bookings, services, providers, users, providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and, lte, gte } from "drizzle-orm";
import { getDay } from "date-fns"; // Helper to get day of week
import { sendEmail } from "@/lib/email";
import { createNotificationOnce } from "@/lib/notifications";
import { bookingIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Helper function to create a unique ID
const generateBookingId = () => `bk_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serviceId, scheduledDate, customerRegion } = await req.json();
    if (!serviceId) {
      return new NextResponse("Missing serviceId", { status: 400 });
    }

    const rateLimit = await enforceRateLimit(req, {
      userId,
      resource: "bookings:create",
      limit: 5,
      windowSeconds: 60,
    });

    if (!rateLimit.success) {
      return rateLimitResponse(rateLimit.retryAfter);
    }

    const idemKey = bookingIdempotencyKey("create", userId, serviceId, { serviceId, scheduledDate });

    const newBooking = await withIdempotency(idemKey, 6 * 60 * 60, async () => {
      // --- 1. Sync User with our DB ---
      // Get user details from Clerk
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const userEmail = user.emailAddresses[0]?.emailAddress;
      if (!userEmail) {
        throw new Error("User email not found");
      }

      // Create the User record (if it doesn't exist)
      try {
        await db.insert(users).values({
          id: userId,
          email: userEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.imageUrl,
          role: "user", // Default role
        }).onConflictDoNothing(); // If user already exists, do nothing
      } catch (dbError) {
        console.error("[API_BOOKING_CREATE] Error creating user record:", dbError);
        throw new Error("Failed to sync user record");
      }

      // 2. Get the service details from the database
      const service = await db.query.services.findFirst({
        where: eq(services.id, serviceId),
        with: {
          provider: {
            columns: {
              id: true,
              userId: true,
              baseRegion: true,
              baseSuburb: true,
              serviceRadiusKm: true,
            },
            with: {
              user: { columns: { email: true } },
            },
          },
        },
      });
      if (!service) {
        throw new Error("Service not found");
      }

      // --- 2b. Relaxed region-based service-area check ---
      const providerRegionRaw = service.provider?.baseRegion;
      const providerSuburbRaw = service.provider?.baseSuburb;
      const customerRegionRaw = customerRegion as string | undefined;

      const hasCoords = false; // Coordinates not captured; skip distance gating.

      // If we don't have coordinates, do not block bookings on text mismatch. This prevents OUT_OF_AREA for valid nearby regions/suburbs.
      if (!hasCoords) {
        // We intentionally allow all inputs (including empty) when coords are missing.
      } else {
        // Placeholder for future coordinate-aware checks; keep legacy behavior here if coordinates are added later.
        const normalizeText = (value: string | null | undefined) => value?.toString().trim().toLowerCase() || null;
        const normalizedProviderRegion = normalizeText(providerRegionRaw);
        const normalizedProviderSuburb = normalizeText(providerSuburbRaw);
        const normalizedCustomerText = normalizeText(customerRegionRaw);
        const text = normalizedCustomerText || "";
        const matchesRegion = normalizedProviderRegion ? text.includes(normalizedProviderRegion) : false;
        const matchesSuburb = normalizedProviderSuburb ? text.includes(normalizedProviderSuburb) : false;

        if (!(matchesRegion || matchesSuburb)) {
          console.warn("[BOOKING_OUT_OF_AREA_COORD]", {
            providerId: service.providerId,
            providerRegion: providerRegionRaw,
            providerSuburb: providerSuburbRaw,
            customerRegion: customerRegionRaw,
            serviceId: service.id,
            timestamp: new Date().toISOString(),
          });
          throw new Error("OUT_OF_AREA");
        }
      }

      // 3. Check that a user is not booking their own service
      const userProvider = await db.query.providers.findFirst({
        where: eq(providers.userId, userId),
      });

      if (userProvider && service.providerId === userProvider.id) {
        throw new Error("SELF_BOOKING");
      }

      // --- 4. NEW: Check Provider Availability ---
      if (scheduledDate) {
        const requestedTime = new Date(scheduledDate);

        const dayOfWeekIndex = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ] as const;

        const requestedDay = dayOfWeekIndex[getDay(requestedTime)]; // e.g., "monday"

        const providerSchedule = await db.query.providerAvailabilities.findFirst({
          where: and(
            eq(providerAvailabilities.providerId, service.providerId),
            eq(providerAvailabilities.dayOfWeek, requestedDay),
            eq(providerAvailabilities.isEnabled, true),
          ),
        });

        if (!providerSchedule) {
          throw new Error(`Provider is not available on ${requestedDay}s.`);
        }

        const requestedTimeStr = requestedTime.toTimeString().substring(0, 5); // "HH:mm"
        const startTimeStr = providerSchedule.startTime.toString().substring(0, 5);
        const endTimeStr = providerSchedule.endTime.toString().substring(0, 5);

        if (requestedTimeStr < startTimeStr || requestedTimeStr > endTimeStr) {
          throw new Error(`Provider is only available between ${startTimeStr} and ${endTimeStr} on ${requestedDay}s.`);
        }

        const timeOff = await db.query.providerTimeOffs.findFirst({
          where: and(
            eq(providerTimeOffs.providerId, service.providerId),
            lte(providerTimeOffs.startTime, requestedTime),
            gte(providerTimeOffs.endTime, requestedTime),
          ),
        });

        if (timeOff) {
          throw new Error(`Provider is unavailable on this date for: ${timeOff.reason || "Time Off"}.`);
        }
      }
      // --- End Availability Check ---

      // 5. Create the booking
      const [created] = await db.insert(bookings).values({
        id: generateBookingId(),
        userId: userId,
        serviceId: service.id,
        providerId: service.providerId, // Denormalized for easy queries
        status: "pending",
        priceAtBooking: service.priceInCents, // Snapshot the price
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      }).returning();

      console.log(`[API_BOOKING_CREATE] User ${userId} created Booking ${created.id} for Service ${service.id}`);

      // --- 5. Send Notification Email to Provider ---
      try {
        const providerEmail = service.provider?.user?.email;

        if (providerEmail) {
          await sendEmail({
            to: providerEmail,
            subject: `New Booking Request for ${service.title}`,
            html: `
            <h1>New Booking Request</h1>
            <p>A customer has requested your service: <strong>${service.title}</strong>.</p>
            <p>Please log in to your dashboard to accept or reject this booking.</p>
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/bookings/provider">Manage Bookings</a>
          `,
          });
        }
      } catch (emailError) {
        console.error("[API_BOOKING_CREATE] Failed to send email:", emailError);
      }

      // --- 6. Create In-App Notification ---
      try {
        const providerUser = await db.query.users.findFirst({
          where: eq(users.id, service.provider.userId),
        });

        if (providerUser) {
          await createNotificationOnce({
            event: "booking_created",
            bookingId: created.id,
            userId: providerUser.id,
            payload: {
              userId: providerUser.id,
              message: `New request for ${service.title}`,
              href: "/dashboard/bookings/provider",
            },
            ttlSeconds: 6 * 60 * 60,
          });
        }
      } catch (notifError) {
        console.error("[API_BOOKING_CREATE] Failed to create notification:", notifError);
      }

      return created;
    });

    return NextResponse.json(newBooking);

  } catch (error) {
    console.error("[API_BOOKING_CREATE]", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";

    if (message === "OUT_OF_AREA") {
      return NextResponse.json(
        {
          error: "OUT_OF_AREA",
          message: "This provider doesn't currently service your area.",
        },
        { status: 400 },
      );
    }

    if (message === "SELF_BOOKING") {
      return new NextResponse("You cannot book your own service", { status: 400 });
    }

    if (message === "Service not found") {
      return new NextResponse(message, { status: 404 });
    }

    if (message === "User email not found") {
      return new NextResponse(message, { status: 400 });
    }

    if (message.startsWith("Provider is")) {
      return new NextResponse(message, { status: 400 });
    }

    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

