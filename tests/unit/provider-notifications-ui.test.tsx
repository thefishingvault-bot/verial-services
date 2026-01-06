// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProviderNotificationsPage from "@/app/dashboard/provider/(app)/notifications/page";

vi.mock("@/lib/auth-guards", () => ({
  requireProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_1" }),
}));

vi.mock("@/lib/notifications", () => ({
  listNotifications: vi.fn().mockResolvedValue({
    items: [
      {
        id: "n1",
        title: "New booking request",
        body: "You have a new booking from Alex",
        message: "New booking",
        actionUrl: "/dashboard/provider/bookings/b_1",
        href: "/dashboard/provider/bookings/b_1",
        isRead: false,
        createdAt: new Date(),
      },
    ],
    nextCursor: null,
  }),
}));

describe("ProviderNotificationsPage", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], nextCursor: null }),
    });
  });

  it("renders provider notifications heading and feed", async () => {
    render(await ProviderNotificationsPage());

    await waitFor(() => {
      expect(screen.getByText(/Provider inbox/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Your notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/New booking request/i)).toBeInTheDocument();
  });
});
