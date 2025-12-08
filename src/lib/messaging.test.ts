import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureBookingRelationship, __testables } from "./messaging";

// Hoist mocks so Vitest has initialized references before vi.mock runs
const { providersFindFirst, bookingsFindFirst } = vi.hoisted(() => ({
  providersFindFirst: vi.fn(),
  bookingsFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      providers: { findFirst: providersFindFirst },
      bookings: { findFirst: bookingsFindFirst },
    },
  },
}));

const { sanitizeContent } = __testables;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sanitizeContent", () => {
  it("trims, strips HTML, and caps length", () => {
    const raw = "  <b>Hello</b> world";
    const result = sanitizeContent(raw);
    expect(result).toBe("Hello world");

    const long = "a".repeat(2050);
    expect(sanitizeContent(long).length).toBe(2000);
  });
});

describe("ensureBookingRelationship", () => {
  it("returns booking link when providerId is provided and booking exists", async () => {
    providersFindFirst.mockResolvedValue({ id: "prov_1", userId: "user_provider" });
    bookingsFindFirst.mockResolvedValue({ id: "bk_1" });

    const result = await ensureBookingRelationship({ currentUserId: "user_customer", providerId: "prov_1" });

    expect(result.bookingId).toBe("bk_1");
    expect(result.providerUserId).toBe("user_provider");
    expect(result.customerUserId).toBe("user_customer");
    expect(result.counterpartUserId).toBe("user_provider");
  });

  it("throws when no booking exists", async () => {
    providersFindFirst.mockResolvedValue({ id: "prov_1", userId: "user_provider" });
    bookingsFindFirst.mockResolvedValue(null);

    await expect(
      ensureBookingRelationship({ currentUserId: "user_customer", providerId: "prov_1" }),
    ).rejects.toThrow("booking");
  });
});
