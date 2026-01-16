// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "user_1" }),
  currentUser: async () => ({ id: "user_1" }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({ publicMetadata: { role: "user" } }),
    },
  }),
}));

const emptyData = {
  user: { id: "user_1", name: "Tester" },
  favorites: [],
  unreadNotifications: 0,
  upcomingBookings: [],
  pastBookings: [],
  reviewsDue: [],
  favoritesPreview: [],
  recommendations: [],
};

vi.mock("@/lib/dashboard/customer-dashboard", () => ({
  getCustomerDashboardData: vi.fn().mockResolvedValue(emptyData),
}));

describe("/dashboard page empty states", () => {
  it("shows empty booking/favorites states and review reminders stays hidden", async () => {
    const Page = (await import("@/app/dashboard/(customer)/page")).default;
    const ui = await Page();
    render(ui as any);

    expect(screen.getByText(/No upcoming bookings right now\./i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Past \(0\)/i }));
    expect(await screen.findByText(/No past bookings yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No favorites yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Review reminders/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Recommended for you/i)).toBeInTheDocument();
    expect(screen.getByText(/No recommendations yet/i)).toBeInTheDocument();
  }, 15000);
});
