// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import type { FavoriteService } from "@/lib/favorites";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: true }) }));

const user = userEvent.setup();

const baseItem: FavoriteService = {
  id: "svc_1",
  slug: "svc-1",
  title: "Service One",
  description: "Great service",
  category: "cleaning",
  priceInCents: 12000,
  chargesGst: true,
  coverImageUrl: null,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  favoritedAt: new Date("2024-02-01T00:00:00Z"),
  avgRating: 4.5,
  reviewCount: 12,
  favoriteCount: 2,
  provider: {
    id: "prov_1",
    handle: "prov",
    businessName: "Provider",
    trustLevel: "gold",
    trustScore: 80,
    isVerified: true,
    region: "Auckland",
    suburb: null,
  },
  isFavorited: true,
  score: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ isFavorited: false, count: 0 }),
  });
});

describe("FavoritesGrid", () => {
  it("renders cards with provider and rating info", () => {
    render(<FavoritesGrid items={[baseItem]} sort="recent" />);
    expect(screen.getByText(/Service One/)).toBeInTheDocument();
    expect(screen.getByText(/Auckland/)).toBeInTheDocument();
    expect(screen.getByText(/4.5/)).toBeInTheDocument();
  });

  it("removes card when unfavorited", async () => {
    render(<FavoritesGrid items={[baseItem]} sort="recent" />);
    const button = screen.getByRole("button", { name: /remove from favorites/i });
    await act(async () => {
      await user.click(button);
    });

    expect(screen.queryByText(/Service One/)).not.toBeInTheDocument();
  });

  it("returns null when no favorites", () => {
    render(<FavoritesGrid items={[]} sort="recent" />);
    expect(screen.getByText(/No favorites yet/i)).toBeInTheDocument();
  });
});
