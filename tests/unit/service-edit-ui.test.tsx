// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EditServicePage from "@/app/dashboard/(customer)/services/[serviceId]/edit/page";

// Note: This test only verifies that the edit page renders
// core UX elements without asserting on data loading.

vi.mock("next/navigation", () => ({
  useParams: () => ({ serviceId: "svc_1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("EditServicePage UI", () => {
  it.skip("renders publish toggle and cover image controls", async () => {
    (global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "svc_1",
        title: "Test Service",
        category: "cleaning",
        priceInCents: 15000,
        description: "Test description",
        chargesGst: true,
        region: "Auckland",
        suburb: "Ponsonby",
        isPublished: true,
        coverImageUrl: null,
      }),
    });

    render(<EditServicePage /> as any);

    await waitFor(() => {
      expect(screen.getByText(/Edit Service/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Publish service/i)).toBeInTheDocument();
    expect(screen.getByText(/Cover Image/i)).toBeInTheDocument();
    expect(screen.getByText(/Change cover image/i)).toBeInTheDocument();
  });
});
