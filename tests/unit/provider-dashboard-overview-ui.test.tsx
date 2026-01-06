// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProviderDashboardPage from "@/app/dashboard/provider/(app)/page";

vi.mock("@/lib/auth-guards", () => ({
  requireProvider: vi.fn().mockResolvedValue({ userId: "user_1" }),
}));

vi.mock("@/lib/db", () => {
  const makeSelect = () => {
    let call = 0;
    return vi.fn(() => {
      call += 1;
      const row =
        call === 1
          ? { count: 1 }
          : call === 2
            ? { count: 1 }
            : call === 3
              ? { net: 10000 }
              : { net: 25000 };

      const where = vi.fn(() => ({
        then: (fn: (rows: unknown[]) => unknown) => Promise.resolve(fn([row])),
      }));

      const from = vi.fn(() => ({ where }));

      return { from };
    });
  };

  return {
    db: {
      query: {
        providers: {
          findFirst: vi.fn().mockResolvedValue({ id: "prov_1" }),
        },
      },
      select: makeSelect(),
    },
  };
});

describe("ProviderDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
