import { db } from "@/lib/db";
import { bookings, services, providers, users } from "@/db/schema";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

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
    });
    if (!service) {
      return new NextResponse("Service not found", { status: 404 });
    }

    // 3. Check that a user is not booking their own service
    const userProvider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId)
    });

    if (userProvider && service.providerId === userProvider.id) {
      return new NextResponse("You cannot book your own service", { status: 400 });
    }

    // 4. Create the booking
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
    return NextResponse.json(newBooking);

  } catch (error) {
    console.error("[API_BOOKING_CREATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

