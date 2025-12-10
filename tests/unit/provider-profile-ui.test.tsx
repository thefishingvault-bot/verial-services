// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProviderProfilePage from "@/app/dashboard/provider/profile/page";

vi.mock("@/lib/auth-guards", () => ({
  requireProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/forms/avatar-uploader", () => ({
  AvatarUploader: ({ onUploadComplete }: { onUploadComplete: (url: string) => void }) => (
    <button type="button" onClick={() => onUploadComplete("https://example.com/avatar.png")}>
      Upload avatar
    </button>
  ),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("ProviderProfilePage", () => {
  beforeEach(() => {
    (global.fetch as any) = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/profile/get")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "user_1",
            email: "test@example.com",
            firstName: "Jane",
            lastName: "Doe",
            avatarUrl: null,
            provider: {
              bio: "Experienced cleaner",
              businessName: "Jane's Cleaning",
              handle: "janes-cleaning",
              trustLevel: "gold",
              trustScore: 82,
            },
          }),
        });
      }

      if (url.includes("/api/provider/settings")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chargesGst: true,
            baseSuburb: "Ponsonby",
            baseRegion: "Auckland",
            serviceRadiusKm: 15,
            coverageRegion: "Auckland",
            coverageSuburbs: ["Ponsonby"],
            gstNumber: "123-456-789",
          }),
        });
      }

      if (url.includes("/api/profile/update") || url.includes("/api/provider/settings/update")) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      return Promise.resolve({ ok: false, text: async () => "not found" });
    });
  });

  it("renders profile fields and trust badge", async () => {
    render(await ProviderProfilePage());

    await waitFor(() => {
      expect(screen.getByText(/Provider profile/i)).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Jane's Cleaning")).toBeInTheDocument();
    expect(screen.getByDisplayValue("janes-cleaning")).toBeInTheDocument();
    expect(screen.getByText(/Trust badge/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("123-456-789")).toBeInTheDocument();
  });
});
