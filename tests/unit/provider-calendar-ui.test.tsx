// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ProviderCalendarClient } from "@/app/dashboard/provider/calendar/calendar-client";
import { ProviderAvailabilityForm } from "@/components/provider/provider-availability-form";

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("ProviderCalendarClient", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookings: [], timeOffs: [] }),
    });
  });

  it("renders calendar with booking and time off", async () => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    render(
      <ProviderCalendarClient
        initialEvents={[
          {
            id: "b1",
            type: "booking",
            status: "pending",
            start: now,
            end: now,
            title: "Booking",
          } as any,
        ]}
        initialTimeOffs={[
          {
            id: "t1",
            type: "time_off",
            status: "time_off",
            start: now,
            end: oneHourLater,
            title: "Holiday",
          } as any,
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Day details/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Pending/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Time off/i).length).toBeGreaterThan(0);
  });

  it.skip("submits time-off creation from dialog", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bookings: [], timeOffs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "t2",
          start: new Date().toISOString(),
          end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          reason: "Vacation",
        }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ bookings: [], timeOffs: [] }),
      });

    (global.fetch as any) = fetchMock;

    render(<ProviderCalendarClient initialEvents={[]} initialTimeOffs={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Time Off/i }));

    await waitFor(() => {
      expect(screen.getByText(/Block time off/i)).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/Vacation, holiday/i);
    fireEvent.change(reasonInput, { target: { value: "Vacation" } });

    fireEvent.click(screen.getByRole("button", { name: /Save time off/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/provider/time-off/create",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

describe("ProviderAvailabilityForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches and renders weekly schedule and saves", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            dayOfWeek: "monday",
            startTime: "09:00:00",
            endTime: "17:00:00",
            isEnabled: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    (global.fetch as any) = fetchMock;

    render(<ProviderAvailabilityForm />);

    await waitFor(() => {
      expect(screen.getByText(/Weekly schedule/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Mon/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save schedule/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/provider/availability/schedule",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
