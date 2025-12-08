// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceFavoriteButton } from "@/components/favorites/service-favorite-button";
import { FavoriteToggle } from "@/components/services/favorite-toggle";

// Mock Clerk auth
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

// Mock next/navigation hooks used by the components
const pushMock = vi.fn();
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
    usePathname: () => "/services",
  };
});

const user = userEvent.setup();

beforeEach(() => {
  pushMock.mockReset();
  vi.clearAllMocks();
  // Default fetch mock resolves with favorited true/count 1
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ isFavorited: true, count: 1 }),
  } as any);
});

describe("ServiceFavoriteButton", () => {
  it("optimistically toggles and shows loading state", async () => {
    render(<ServiceFavoriteButton serviceId="svc_1" initialIsFavorite={false} initialCount={0} />);

    const button = screen.getByRole("button", { name: /add to favorites/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0")).toBeInTheDocument();

    await act(async () => {
      await user.click(button);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/favorites/toggle",
      expect.objectContaining({ method: "POST" }),
    );
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("reverts when the toggle API fails", async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });

    render(<ServiceFavoriteButton serviceId="svc_1" initialIsFavorite={false} initialCount={0} />);
    const button = screen.getByRole("button", { name: /add to favorites/i });

    await act(async () => {
      await user.click(button);
    });

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("FavoriteToggle (card heart)", () => {
  it("shows filled heart when favorited and updates count", async () => {
    const onToggle = vi.fn();
    render(
      <FavoriteToggle
        serviceId="svc_card"
        initialIsFavorite={false}
        initialCount={2}
        showCount
        onToggleOptimistic={onToggle}
      />,
    );

    const button = screen.getByRole("button", { name: /add to favorites/i });
    expect(screen.getByText("2")).toBeInTheDocument();

    await act(async () => {
      await user.click(button);
    });

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("reverts optimistic change on error", async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });

    render(
      <FavoriteToggle
        serviceId="svc_card"
        initialIsFavorite={true}
        initialCount={3}
        showCount
      />,
    );

    const button = screen.getByRole("button", { name: /remove from favorites/i });

    await act(async () => {
      await user.click(button);
    });

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
