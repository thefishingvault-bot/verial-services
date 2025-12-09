// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const emptyData = {
  user: { id: "user_1", name: "Tester" },
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
  it("shows empty booking and favorites states and hides optional sections", async () => {
    const Page = (await import("@/app/dashboard/(customer)/page")).default;
    const ui = await Page();
    render(ui as any);

    expect(screen.getByText(/You have no upcoming bookings/i)).toBeInTheDocument();
    expect(screen.getByText(/No past bookings yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No favorites yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Review reminders/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recommended for you/i)).not.toBeInTheDocument();
  }, 15000);
});
