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

const dashboardDataMock = vi.fn();

const baseData = {
  user: { id: "user_1", name: "Tester" },
  favorites: [],
  unreadNotifications: 0,
  upcomingBookings: [],
  pastBookings: [],
  favoritesPreview: [],
  recommendations: [],
};

describe("Dashboard review reminders section", () => {
  beforeEach(() => {
    vi.resetModules();
    dashboardDataMock.mockReset();
    vi.doMock("@/lib/dashboard/customer-dashboard", () => ({
      getCustomerDashboardData: dashboardDataMock,
    }));
  });

  it("renders reminder cards when present", async () => {
    dashboardDataMock.mockResolvedValue({
      ...baseData,
      reviewsDue: [
        {
          bookingId: "bk1",
          serviceTitle: "Clean",
          providerName: "Cleaner",
          completedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
          reviewUrl: "/dashboard/bookings/bk1/review",
        },
      ],
    });

    const Page = (await import("@/app/dashboard/(customer)/page")).default;
    const ui = await Page();
    render(ui as any);

    expect(await screen.findByText(/Review reminders/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/Clean/)).length).toBeGreaterThan(0);
  }, 15000);

  it("hides reminders section when none", async () => {
    dashboardDataMock.mockResolvedValue({
      ...baseData,
      reviewsDue: [],
    });

    const Page = (await import("@/app/dashboard/(customer)/page")).default;
    const ui = await Page();
    render(ui as any);

    expect(screen.queryByText(/Review reminders/i)).not.toBeInTheDocument();
  }, 15000);
});
