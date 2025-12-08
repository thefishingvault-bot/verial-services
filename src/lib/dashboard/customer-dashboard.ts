import { auth, currentUser } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { bookings, providers, reviews, services } from "@/db/schema";
import { getUserFavoriteServices, type FavoriteService } from "@/lib/favorites";
import { db } from "@/lib/db";
import { canTransition, type BookingStatus } from "@/lib/booking-state";
import { getDashboardRecommendations, type RecommendationCardData } from "@/lib/recommendations";

export type BookingCardData = {
  id: string;
  serviceId: string;
  serviceTitle: string;
  serviceSlug: string;
  serviceCategory: string;
  providerId: string;
  providerName: string | null;
  providerHandle: string | null;
  providerVerified: boolean;
  providerTrustLevel: (typeof providers.trustLevel.enumValues)[number];
  providerTrustScore: number;
  scheduledAt: string | null;
  status: BookingStatus;
  priceInCents: number;
  canCancel: boolean;
  hasReview: boolean;
  reviewId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewPrompt = {
  bookingId: string;
  serviceTitle: string;
  providerName: string | null;
  completedAt: string | null;
  reviewUrl: string;
};

export type CustomerDashboardData = {
  upcomingBookings: BookingCardData[];
  pastBookings: BookingCardData[];
  reviewsDue: ReviewPrompt[];
  favoritesPreview: FavoriteService[];
  recommendations: RecommendationCardData[];
  user: {
    id: string;
    name: string;
    imageUrl?: string;
  };
};

type BookingRow = {
  id: string;
  status: BookingStatus;
  scheduledDate: Date | null;
  priceAtBooking: number;
  createdAt: Date;
  updatedAt: Date;
  serviceId: string;
  serviceTitle: string;
  serviceSlug: string;
  serviceCategory: string;
  providerId: string;
  providerName: string | null;
  providerHandle: string | null;
  providerVerified: boolean;
  providerTrustLevel: (typeof providers.trustLevel.enumValues)[number];
  providerTrustScore: number;
  reviewId: string | null;
};

function mapBookings(rows: BookingRow[]) {
  const upcomingStatuses: BookingStatus[] = ["pending", "accepted", "paid"];

  const cards: BookingCardData[] = rows.map((row) => {
    const scheduledAt = row.scheduledDate ? row.scheduledDate.toISOString() : null;
    const completedDate = row.status === "completed" ? row.updatedAt ?? row.createdAt : null;
    const completedAt = completedDate ? completedDate.toISOString() : null;
    const canCancel = canTransition(row.status, "canceled_customer");

    return {
      id: row.id,
      serviceId: row.serviceId,
      serviceTitle: row.serviceTitle,
      serviceSlug: row.serviceSlug,
      serviceCategory: row.serviceCategory,
      providerId: row.providerId,
      providerName: row.providerName,
      providerHandle: row.providerHandle,
      providerVerified: row.providerVerified,
      providerTrustLevel: row.providerTrustLevel,
      providerTrustScore: row.providerTrustScore,
      scheduledAt,
      status: row.status,
      priceInCents: row.priceAtBooking,
      canCancel,
      hasReview: Boolean(row.reviewId),
      reviewId: row.reviewId,
      completedAt,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  const upcoming = cards
    .filter((c) => upcomingStatuses.includes(c.status))
    .sort((a, b) => {
      const aDate = a.scheduledAt ? new Date(a.scheduledAt) : new Date(a.createdAt);
      const bDate = b.scheduledAt ? new Date(b.scheduledAt) : new Date(b.createdAt);
      return aDate.getTime() - bDate.getTime();
    });

  const past = cards
    .filter((c) => c.status === "completed")
    .sort((a, b) => {
      const aDate = new Date(a.completedAt ?? a.updatedAt ?? a.createdAt);
      const bDate = new Date(b.completedAt ?? b.updatedAt ?? b.createdAt);
      return bDate.getTime() - aDate.getTime();
    });

  const reviewsDue: ReviewPrompt[] = past
    .filter((c) => !c.hasReview)
    .slice(0, 3)
    .map((c) => ({
      bookingId: c.id,
      serviceTitle: c.serviceTitle,
      providerName: c.providerName,
      completedAt: c.completedAt,
      reviewUrl: `/dashboard/bookings/${c.id}/review`,
    }));

  return { upcoming, past, reviewsDue };
}

async function fetchBookingsForUser(userId: string): Promise<BookingRow[]> {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      scheduledDate: bookings.scheduledDate,
      priceAtBooking: bookings.priceAtBooking,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      serviceId: services.id,
      serviceTitle: services.title,
      serviceSlug: services.slug,
      serviceCategory: services.category,
      providerId: providers.id,
      providerName: providers.businessName,
      providerHandle: providers.handle,
      providerVerified: providers.isVerified,
      providerTrustLevel: providers.trustLevel,
      providerTrustScore: providers.trustScore,
      reviewId: reviews.id,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .innerJoin(providers, eq(bookings.providerId, providers.id))
    .leftJoin(reviews, eq(reviews.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.userId, userId),
        eq(providers.status, "approved"),
        eq(providers.isSuspended, false),
      ),
    )
    .orderBy(desc(bookings.createdAt));

  return rows;
}

export async function getCustomerDashboardData(): Promise<CustomerDashboardData> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await currentUser();
  const profile = {
    id: userId,
    name: user?.fullName || user?.firstName || "Customer",
    imageUrl: user?.imageUrl || undefined,
  };

  const [bookingRows, favoritesPreview, recommendations] = await Promise.all([
    fetchBookingsForUser(userId),
    getUserFavoriteServices(userId, "recent").then((items) => items.slice(0, 3)),
    getDashboardRecommendations(userId),
  ]);

  const { upcoming, past, reviewsDue } = mapBookings(bookingRows);

  return {
    upcomingBookings: upcoming,
    pastBookings: past,
    reviewsDue,
    favoritesPreview,
    recommendations,
    user: profile,
  };
}