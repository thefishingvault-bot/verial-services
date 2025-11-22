import { db } from "@/lib/db";
import { bookings, services, providers, users, providerAvailabilities, providerTimeOffs } from "@/db/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and, lte, gte } from "drizzle-orm";
import { getDay } from "date-fns"; // Helper to get day of week
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

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

    // --- 1. Sync User with our DB ---
    // Get user details from Clerk
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userEmail = user.emailAddresses[0]?.emailAddress;
    if (!userEmail) {
      return new NextResponse("User email not found", { status: 400 });
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
      return new NextResponse("Failed to sync user record", { status: 500 });
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
          },
          with: {
            user: { columns: { email: true } },
          },
        }
      }
    });
    if (!service) {
      return new NextResponse("Service not found", { status: 404 });
    }

    // --- 2b. Simple region-based service-area check (MVP) ---
    const providerRegionRaw = service.provider?.baseRegion;
    const customerRegionRaw = customerRegion as string | undefined;

    const normalizeRegion = (value: string | null | undefined) =>
      value?.toString().trim().toLowerCase() || null;

    const normalizedProviderRegion = normalizeRegion(providerRegionRaw);
    const normalizedCustomerRegion = normalizeRegion(customerRegionRaw);

    if (normalizedProviderRegion && normalizedCustomerRegion) {
      if (normalizedProviderRegion !== normalizedCustomerRegion) {
        console.warn("[BOOKING_OUT_OF_AREA]", {
          providerId: service.providerId,
          providerRegion: providerRegionRaw,
          customerRegion: customerRegionRaw,
          serviceId: service.id,
          timestamp: new Date().toISOString(),
        });

        return NextResponse.json(
          {
            error: "OUT_OF_AREA",
            message: "This provider doesnt currently service your area.",
          },
          { status: 400 },
        );
      }
    }

    // 3. Check that a user is not booking their own service
    const userProvider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (userProvider && service.providerId === userProvider.id) {
      return new NextResponse("You cannot book your own service", { status: 400 });
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
        return new NextResponse(`Provider is not available on ${requestedDay}s.`, { status: 400 });
      }

      const requestedTimeStr = requestedTime.toTimeString().substring(0, 5); // "HH:mm"
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
          eq(providerTimeOffs.providerId, service.providerId),
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
    }
    // --- End Availability Check ---

    // 5. Create the booking
    const [newBooking] = await db.insert(bookings).values({
      id: generateBookingId(),
      userId: userId,
      serviceId: service.id,
      providerId: service.providerId, // Denormalized for easy queries
      status: "pending",
      priceAtBooking: service.priceInCents, // Snapshot the price
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
    }).returning();

    console.log(`[API_BOOKING_CREATE] User ${userId} created Booking ${newBooking.id} for Service ${service.id}`);

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
        await createNotification({
          userId: providerUser.id,
          message: `New request for ${service.title}`,
          href: "/dashboard/bookings/provider",
        });
      }
    } catch (notifError) {
      console.error("[API_BOOKING_CREATE] Failed to create notification:", notifError);
    }

    return NextResponse.json(newBooking);

  } catch (error) {
    console.error("[API_BOOKING_CREATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

