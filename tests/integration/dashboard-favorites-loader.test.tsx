// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FavoriteService } from "@/lib/favorites";

const mockFavorites: FavoriteService[] = [
  {
    id: "svc_1",
    slug: "svc-1",
    title: "Service One",
    description: "Great service",
    category: "cleaning",
    priceInCents: 1000,
    chargesGst: true,
    coverImageUrl: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    favoritedAt: new Date("2024-02-01T00:00:00Z"),
    avgRating: 4,
    reviewCount: 2,
    favoriteCount: 1,
    provider: {
      id: "prov_1",
      handle: "handle",
      businessName: "Biz",
      trustLevel: "gold",
      trustScore: 80,
      isVerified: true,
      region: "Auckland",
      suburb: null,
    },
    isFavorited: true,
    score: 5,
  },
];

const authMock = vi.fn();
const favoritesMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/favorites", () => ({ getUserFavoriteServices: favoritesMock }));

describe("/dashboard/favorites loader", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_1" });
    favoritesMock.mockResolvedValue(mockFavorites);
  });

  it("renders favorites grid", async () => {
    const page = (await import("@/app/dashboard/(customer)/favorites/page")).default;
    const ui = await page({ searchParams: Promise.resolve({}) });
    render(ui as any);

    expect(screen.getByText(/Saved services/)).toBeInTheDocument();
    expect(screen.getByText(/Service One/)).toBeInTheDocument();
  });
});
