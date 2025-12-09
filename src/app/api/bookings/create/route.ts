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

    const { serviceId, scheduledDate } = await req.json();
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

      // 3. Check that a user is not booking their own service
      const userProvider = await db.query.providers.findFirst({
        where: eq(providers.userId, userId),
      });

      if (userProvider && service.providerId === userProvider.id) {
        throw new Error("SELF_BOOKING");
      }

      // --- 4. Availability check (soft) ---
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
          console.warn("[BOOKING_AVAILABILITY_SOFT_NO_SCHEDULE]", {
            providerId: service.providerId,
            requestedDay,
            scheduledDate,
          });
        } else {
          const requestedTimeStr = requestedTime.toTimeString().substring(0, 5); // "HH:mm"
          const startTimeStr = providerSchedule.startTime.toString().substring(0, 5);
          const endTimeStr = providerSchedule.endTime.toString().substring(0, 5);

          const outsideWindow = requestedTimeStr < startTimeStr || requestedTimeStr > endTimeStr;
          if (outsideWindow) {
            console.warn("[BOOKING_AVAILABILITY_SOFT_WINDOW]", {
              providerId: service.providerId,
              requestedDay,
              requestedTime: requestedTimeStr,
              startTime: startTimeStr,
              endTime: endTimeStr,
              scheduledDate,
            });
          }

          const timeOff = await db.query.providerTimeOffs.findFirst({
            where: and(
              eq(providerTimeOffs.providerId, service.providerId),
              lte(providerTimeOffs.startTime, requestedTime),
              gte(providerTimeOffs.endTime, requestedTime),
            ),
          });

          if (timeOff) {
            console.warn("[BOOKING_AVAILABILITY_SOFT_TIME_OFF]", {
              providerId: service.providerId,
              requestedDay,
              requestedTime: requestedTimeStr,
              startTime: startTimeStr,
              endTime: endTimeStr,
              scheduledDate,
              timeOffReason: timeOff.reason,
            });
          }
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
        region: service.region ?? null,
        suburb: service.suburb ?? null,
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

