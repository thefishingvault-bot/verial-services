// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import type { FavoriteService } from "@/lib/favorites";

// Mock FavoriteToggle to drive onSettled state updates deterministically.
vi.mock("@/components/services/favorite-toggle", () => ({
  FavoriteToggle: ({ onSettled }: any) => (
    <button onClick={() => onSettled({ isFavorited: false, count: 0 })}>Toggle</button>
  ),
}));

const user = userEvent.setup();

const favorites: FavoriteService[] = [
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

describe("FavoritesGrid interactions", () => {
  it("removes card when unfavorited via toggle", async () => {
    render(<FavoritesGrid items={favorites} sort="recent" />);
    expect(screen.getByText(/Service One/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /toggle/i }));

    expect(screen.queryByText(/Service One/)).not.toBeInTheDocument();
  });
});
