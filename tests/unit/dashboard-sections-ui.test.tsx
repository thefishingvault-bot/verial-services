// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerDashboardSections } from "@/components/dashboard/customer-dashboard-sections";
import type { CustomerDashboardData } from "@/lib/dashboard/customer-dashboard";

const user = userEvent.setup();

const baseData: CustomerDashboardData = {
  user: { id: "user_1", name: "Test" },
  favorites: [],
  unreadNotifications: 0,
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
  pastBookings: [
    {
      id: "bk2",
      serviceId: "svc2",
      serviceTitle: "Paint",
      serviceSlug: "paint",
      serviceCategory: "detailing",
      providerId: "prov2",
      providerName: "Painter",
      providerHandle: "painter",
      providerVerified: false,
      providerTrustLevel: "silver",
      providerTrustScore: 50,
      scheduledAt: new Date("2024-10-01T10:00:00Z").toISOString(),
      status: "completed",
      priceInCents: 2000,
      canCancel: false,
      hasReview: false,
      reviewId: null,
      completedAt: new Date("2024-10-02T00:00:00Z").toISOString(),
      createdAt: new Date("2024-09-01T00:00:00Z").toISOString(),
      updatedAt: new Date("2024-10-02T00:00:00Z").toISOString(),
    },
  ],
  reviewsDue: [
    {
      bookingId: "bk2",
      serviceTitle: "Paint",
      providerName: "Painter",
      completedAt: new Date("2024-10-02T00:00:00Z").toISOString(),
      reviewUrl: "/dashboard/bookings/bk2/review",
    },
  ],
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
        region: "Auckland",
        suburb: null,
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

beforeEach(() => {
  (global.fetch as any) = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("CustomerDashboardSections", () => {
  it("renders all sections and actions", async () => {
    render(<CustomerDashboardSections data={baseData} />);

    expect(screen.getByText(/Upcoming bookings/i)).toBeInTheDocument();
    expect(screen.getByText(/Past bookings/i)).toBeInTheDocument();
    expect(screen.getByText(/Review reminders/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Favorites/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recommended for you/i)).toBeInTheDocument();

    // Cancel button removes upcoming booking optimistically
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Cancel booking/i }));
    });
    expect(screen.queryByText(/Clean/)).not.toBeInTheDocument();
  });

  it("shows empty states when no data", () => {
    const emptyData: CustomerDashboardData = {
      ...baseData,
      upcomingBookings: [],
      pastBookings: [],
      reviewsDue: [],
      favorites: [],
      favoritesPreview: [],
      recommendations: [],
      unreadNotifications: 0,
    };

    render(<CustomerDashboardSections data={emptyData} />);

    expect(screen.getByText(/You have no upcoming bookings/i)).toBeInTheDocument();
    expect(screen.getByText(/No past bookings yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Review reminders/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No favorites yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Recommended for you/i)).not.toBeInTheDocument();
  });
});
