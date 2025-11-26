import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { providers, users, bookings, reviews } from "@/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

type SortOption = "bookings" | "cancellations" | "reviews" | "trust" | "created";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sortBy = (searchParams.get("sort") as SortOption) || "bookings";
    const sortOrder = searchParams.get("order") === "asc" ? asc : desc;

    // Fetch providers with health metrics
    const providersWithHealth = await db
      .select({
        id: providers.id,
        businessName: providers.businessName,
        handle: providers.handle,
        status: providers.status,
        trustLevel: providers.trustLevel,
        trustScore: providers.trustScore,
        createdAt: providers.createdAt,
        user: {
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        // Aggregated metrics
        totalBookings: sql<number>`count(${bookings.id})`.as("total_bookings"),
        completedBookings: sql<number>`count(case when ${bookings.status} = 'completed' then 1 end)`.as("completed_bookings"),
        cancelledBookings: sql<number>`count(case when ${bookings.status} = 'canceled' then 1 end)`.as("cancelled_bookings"),
        totalReviews: sql<number>`count(${reviews.id})`.as("total_reviews"),
        avgRating: sql<number>`avg(${reviews.rating})`.as("avg_rating"),
      })
      .from(providers)
      .leftJoin(users, eq(providers.userId, users.id))
      .leftJoin(bookings, eq(providers.id, bookings.providerId))
      .leftJoin(reviews, eq(providers.id, reviews.providerId))
      .groupBy(providers.id, users.email, users.firstName, users.lastName)
      .orderBy(
        sortBy === "bookings" ? sortOrder(sql`count(${bookings.id})`) :
        sortBy === "cancellations" ? sortOrder(sql`count(case when ${bookings.status} = 'canceled' then 1 end)`) :
        sortBy === "reviews" ? sortOrder(sql`count(${reviews.id})`) :
        sortBy === "trust" ? sortOrder(providers.trustScore) :
        sortOrder(providers.createdAt)
      );

    const processedProviders = providersWithHealth.map(provider => ({
      ...provider,
      cancellationRate: provider.totalBookings > 0 ? (provider.cancelledBookings / provider.totalBookings) * 100 : 0,
      completionRate: provider.totalBookings > 0 ? (provider.completedBookings / provider.totalBookings) * 100 : 0,
    }));

    return NextResponse.json(processedProviders);
  } catch (error) {
    console.error("Error fetching provider health data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
