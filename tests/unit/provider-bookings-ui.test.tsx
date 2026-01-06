// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProviderBookingsClient } from "@/app/dashboard/provider/(app)/bookings/bookings-client";

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("ProviderBookingsClient", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "bk1",
          status: "pending",
          createdAt: new Date().toISOString(),
          scheduledDate: new Date().toISOString(),
          priceAtBooking: 15000,
          service: { title: "Lawn mowing" },
          provider: {
            id: "prov1",
            baseSuburb: "Albany",
            baseRegion: "Auckland",
            serviceRadiusKm: 10,
          },
          user: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
        },
      ],
    });
  });

  it("renders bookings and detail link", async () => {
    render(<ProviderBookingsClient />);

    await waitFor(() => {
      expect(screen.getByText(/Lawn mowing/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/New requests/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View details/i }),
    ).toHaveAttribute("href", "/dashboard/provider/bookings/bk1");
  });

  it("shows error state when fetch fails", async () => {
    (global.fetch as any) = vi.fn().mockResolvedValue({ ok: false, text: async () => "fail" });

    render(<ProviderBookingsClient />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch bookings\./i)).toBeInTheDocument();
    });
  });
});
