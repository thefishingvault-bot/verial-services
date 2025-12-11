// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "user_1" }),
  currentUser: async () => ({ id: "user_1" }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({ publicMetadata: { role: "user" } }),
    },
  }),
}));

const mockData = {
  user: { id: "user_1", name: "Tester" },
  upcomingBookings: [
    {
      id: "bk1",
      serviceId: "svc1",
      serviceTitle: "Clean",
      serviceSlug: "clean",
      serviceCategory: "cleaning",
      providerId: "prov1",
      providerName: "Cleaner",
      providerHandle: "cleaner",
      providerVerified: true,
      providerTrustLevel: "gold",
      providerTrustScore: 80,
      scheduledAt: new Date("2025-01-02T10:00:00Z").toISOString(),
      status: "accepted",
      priceInCents: 1000,
      canCancel: true,
      hasReview: false,
      reviewId: null,
      completedAt: null,
      createdAt: new Date("2024-12-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-12-02T00:00:00Z").toISOString(),
    },
  ],
  pastBookings: [],
  reviewsDue: [],
  favoritesPreview: [
    {
      id: "svc_fav",
      slug: "fav",
      title: "Fav Service",
      description: "desc",
      category: "cleaning",
      priceInCents: 1234,
      chargesGst: true,
      coverImageUrl: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      favoritedAt: new Date("2024-02-01T00:00:00Z"),
      avgRating: 4,
      reviewCount: 2,
      favoriteCount: 1,
      provider: {
        id: "prov_f",
        handle: "handle",
        businessName: "Biz",
        trustLevel: "gold",
        trustScore: 80,
        isVerified: true,
        baseRegion: "Auckland",
      },
      isFavorited: true,
      score: 5,
    },
  ],
  recommendations: [
    {
      serviceId: "svc_rec",
      slug: "rec",
      title: "Recommended",
      description: "Great",
      priceInCents: 1500,
      category: "cleaning",
      coverImageUrl: null,
      provider: {
        id: "prov_r",
        name: "Rec Provider",
        handle: "rec",
        trustLevel: "gold",
        trustScore: 90,
        isVerified: true,
      },
      score: 12,
      reason: "Because you like this category",
    },
  ],
};

vi.mock("@/lib/dashboard/customer-dashboard", () => ({
  getCustomerDashboardData: vi.fn().mockResolvedValue(mockData),
}));

describe("/dashboard page", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders navigation cards and sections", async () => {
    const Page = (await import("@/app/dashboard/(customer)/page")).default;
    const ui = await Page();
    render(ui as any);

    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse Services/i)).toBeInTheDocument();
    expect(screen.getByText(/My Bookings/i)).toBeInTheDocument();
    expect(screen.getByText(/Upcoming bookings/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Favorites/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recommended for you/i)).toBeInTheDocument();
  }, 15000);
});
