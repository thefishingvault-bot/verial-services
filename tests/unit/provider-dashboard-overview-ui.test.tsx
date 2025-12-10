// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProviderDashboardPage from "@/app/dashboard/provider/page";

vi.mock("@/lib/auth-guards", () => ({
  requireProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_1" }),
}));

describe("ProviderDashboardPage", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/provider/bookings/list")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { status: "pending", createdAt: new Date().toISOString() },
            { status: "accepted", createdAt: new Date().toISOString() },
          ],
        });
      }
      if (url.includes("/api/provider/earnings/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pendingPayoutsNet: 10000, completedPayoutsNet: 25000 }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  });

  it("renders metrics cards with data", async () => {
    render(await ProviderDashboardPage());

    await waitFor(() => {
      const labels = screen.getAllByText(/New requests/i);
      expect(labels.length).toBeGreaterThan(0);
    });

    const counts = screen.getAllByText("1");
    expect(counts.length).toBeGreaterThan(0);
    expect(screen.getByText(/Jobs confirmed/i)).toBeInTheDocument();
  });
});
