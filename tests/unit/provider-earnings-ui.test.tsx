// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProviderEarningsPage from "@/app/dashboard/provider/(app)/earnings/page";

vi.mock("@/lib/auth-guards", () => ({
  requireProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_1" }),
}));

describe("ProviderEarningsPage", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        currency: "NZD",
        connect: {
          stripeConnectId: "acct_123",
          chargesEnabled: true,
          payoutsEnabled: true,
        },
        lifetime: { gross: 100000, fee: 10000, gst: 5000, net: 85000 },
        last30: { gross: 20000, fee: 2000, gst: 1000, net: 17000 },
        pendingPayoutsNet: 5000,
        completedPayoutsNet: 80000,
        upcomingPayout: {
          id: "payout_1",
          amount: 5000,
          status: "pending",
          arrivalDate: new Date().toISOString(),
          estimatedArrival: null,
        },
        recentBookings: [
          {
            bookingId: "b_1",
            serviceTitle: "Dog walking",
            bookingStatus: "completed",
            payoutStatus: "awaiting_payout",
            grossAmount: 10000,
            platformFeeAmount: 1000,
            gstAmount: 500,
            netAmount: 8500,
            payoutDate: null,
            paidAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  it("renders summary cards and recent earnings table", async () => {
    render(await ProviderEarningsPage());

    await waitFor(() => {
      expect(screen.getByText(/Lifetime earnings/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Recent earnings/i)).toBeInTheDocument();
    expect(screen.getByText(/Dog walking/i)).toBeInTheDocument();
  });

  it("shows Stripe warning when no payouts", async () => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        currency: "NZD",
        connect: {
          stripeConnectId: null,
          chargesEnabled: false,
          payoutsEnabled: false,
        },
        lifetime: { gross: 0, fee: 0, gst: 0, net: 0 },
        last30: { gross: 0, fee: 0, gst: 0, net: 0 },
        pendingPayoutsNet: 0,
        completedPayoutsNet: 0,
        upcomingPayout: null,
        recentBookings: [],
      }),
    });

    render(await ProviderEarningsPage());

    await waitFor(() => {
      expect(
        screen.getByText(/Your Stripe Connect payout account is not set up/i),
      ).toBeInTheDocument();
    });
  });
});
