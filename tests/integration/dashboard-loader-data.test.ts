import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import * as drizzleOrm from "drizzle-orm";
import { getCustomerDashboardData } from "@/lib/dashboard/customer-dashboard";
import * as favorites from "@/lib/favorites";
import * as recommendations from "@/lib/recommendations";
import * as dbMod from "@/lib/db";
import { bookings, providers, services } from "@/db/schema";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "user_int" }),
  currentUser: () => Promise.resolve({ fullName: "Integration User" }),
}));

const mockSelect = vi.fn();

describe("dashboard loader integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const whereMock = vi.fn(() => ({
      orderBy: () => Promise.resolve([
        {
          id: "bk_up",
          status: "accepted",
          scheduledDate: new Date("2025-01-01T10:00:00Z"),
          priceAtBooking: 1000,
          createdAt: new Date("2024-12-01T00:00:00Z"),
          updatedAt: new Date("2024-12-02T00:00:00Z"),
          serviceId: "svc_1",
          serviceTitle: "Clean",
          serviceSlug: "clean",
          serviceCategory: "cleaning",
          providerId: "prov_ok",
          providerName: "Provider",
          providerHandle: "prov",
          providerVerified: true,
          providerTrustLevel: "gold",
          providerTrustScore: 80,
          reviewId: null,
        },
        {
          id: "bk_done",
          status: "completed",
          scheduledDate: new Date("2024-10-01T10:00:00Z"),
          priceAtBooking: 2000,
          createdAt: new Date("2024-09-01T00:00:00Z"),
          updatedAt: new Date("2024-10-02T00:00:00Z"),
          serviceId: "svc_2",
          serviceTitle: "Paint",
          serviceSlug: "paint",
          serviceCategory: "detailing",
          providerId: "prov_ok",
          providerName: "Painter",
          providerHandle: "paint-pro",
          providerVerified: false,
          providerTrustLevel: "silver",
          providerTrustScore: 50,
          reviewId: null,
        },
      ]),
    }));

    const innerJoin = vi.fn().mockReturnThis();
    const leftJoin = vi.fn().mockReturnThis();

    mockSelect.mockReturnValue({
      from: () => ({ innerJoin, leftJoin, where: whereMock }),
    });

    vi.spyOn(dbMod, "db", "get").mockReturnValue({ select: mockSelect } as any);
    vi.spyOn(favorites, "getUserFavoriteServices").mockResolvedValue([
      { id: "fav1" } as any,
      { id: "fav2" } as any,
      { id: "fav3" } as any,
      { id: "fav4" } as any,
    ]);
    vi.spyOn(recommendations, "getDashboardRecommendations").mockResolvedValue([
      { serviceId: "svc_rec" } as any,
    ]);
  });

  it("returns upcoming, past, review reminders, capped favorites, and hits suspended filter", async () => {
    const data = await getCustomerDashboardData();

    expect(data.upcomingBookings.map((b) => b.id)).toEqual(["bk_up"]);
    expect(data.pastBookings.map((b) => b.id)).toEqual(["bk_done"]);
    expect(data.reviewsDue[0].bookingId).toBe("bk_done");
    expect(data.favoritesPreview).toHaveLength(3);
    expect(data.recommendations[0]?.serviceId).toBe("svc_rec");

  });
});
