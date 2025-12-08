import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCustomerDashboardData } from "@/lib/dashboard/customer-dashboard";
import * as favorites from "@/lib/favorites";
import * as recommendations from "@/lib/recommendations";
import * as dbMod from "@/lib/db";
import { providers } from "@/db/schema";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "user_1" }),
  currentUser: () => Promise.resolve({ fullName: "Test User", imageUrl: "https://img" }),
}));

const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  innerJoin: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
}));

describe("getCustomerDashboardData", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.spyOn(dbMod, "db", "get").mockReturnValue({
      select: mockSelect.mockReturnValue({
        from: mockFrom,
      }),
    } as any);

    vi.spyOn(favorites, "getUserFavoriteServices").mockResolvedValue([]);
    vi.spyOn(recommendations, "getDashboardRecommendations").mockResolvedValue([]);
  });

  it("categorizes bookings, limits reviews due to 3, and slices favorites preview", async () => {
    const fakeRows = [
      {
        id: "bk_upcoming",
        status: "accepted",
        scheduledDate: new Date("2025-01-01T10:00:00Z"),
        priceAtBooking: 1000,
        createdAt: new Date("2024-12-01T00:00:00Z"),
        updatedAt: new Date("2024-12-02T00:00:00Z"),
        serviceId: "svc_1",
        serviceTitle: "Clean",
        serviceSlug: "clean",
        serviceCategory: "cleaning",
        providerId: "prov_1",
        providerName: "Provider",
        providerHandle: "prov",
        providerVerified: true,
        providerTrustLevel: "gold" as (typeof providers.trustLevel.enumValues)[number],
        providerTrustScore: 80,
        reviewId: null,
      },
      {
        id: "bk_past",
        status: "completed",
        scheduledDate: new Date("2024-10-01T10:00:00Z"),
        priceAtBooking: 2000,
        createdAt: new Date("2024-09-01T00:00:00Z"),
        updatedAt: new Date("2024-10-02T00:00:00Z"),
        serviceId: "svc_2",
        serviceTitle: "Paint",
        serviceSlug: "paint",
        serviceCategory: "detailing",
        providerId: "prov_2",
        providerName: "Painter",
        providerHandle: "paint-pro",
        providerVerified: false,
        providerTrustLevel: "silver" as (typeof providers.trustLevel.enumValues)[number],
        providerTrustScore: 50,
        reviewId: null,
      },
      {
        id: "bk_reviewed",
        status: "completed",
        scheduledDate: new Date("2024-11-01T10:00:00Z"),
        priceAtBooking: 3000,
        createdAt: new Date("2024-10-01T00:00:00Z"),
        updatedAt: new Date("2024-11-02T00:00:00Z"),
        serviceId: "svc_3",
        serviceTitle: "Garden",
        serviceSlug: "garden",
        serviceCategory: "gardening",
        providerId: "prov_3",
        providerName: "Gardener",
        providerHandle: "garden-pro",
        providerVerified: true,
        providerTrustLevel: "gold" as (typeof providers.trustLevel.enumValues)[number],
        providerTrustScore: 70,
        reviewId: "rev_1",
      },
    ];

    mockSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                orderBy: () => Promise.resolve(fakeRows),
              }),
            }),
          }),
        }),
      }),
    });

    vi.spyOn(favorites, "getUserFavoriteServices").mockResolvedValue([
      { id: "fav1" } as any,
      { id: "fav2" } as any,
      { id: "fav3" } as any,
      { id: "fav4" } as any,
    ]);

    const data = await getCustomerDashboardData();

    expect(data.upcomingBookings).toHaveLength(1);
    expect(data.upcomingBookings[0].id).toBe("bk_upcoming");

    expect(data.pastBookings).toHaveLength(2);
    expect(data.pastBookings[0].id).toBe("bk_reviewed"); // most recent completed first

    expect(data.reviewsDue).toEqual([
      expect.objectContaining({ bookingId: "bk_past" }),
    ]);
    expect(data.favoritesPreview).toHaveLength(3);
  });
});
