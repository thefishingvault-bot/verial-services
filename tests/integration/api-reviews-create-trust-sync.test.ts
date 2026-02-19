import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const createNotificationMock = vi.fn();
const calculateTrustScoreMock = vi.fn();

const booking = {
  id: "bk_1_abc123",
  status: "completed",
  providerId: "11111111-1111-4111-8111-111111111111",
  serviceId: "22222222-2222-4222-8222-222222222222",
  userId: "user_1",
};

let lastProviderSetPayload: Record<string, unknown> | null = null;

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/notifications", () => ({ createNotification: createNotificationMock }));
vi.mock("@/lib/trust", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trust")>();
  return {
    ...actual,
    calculateTrustScore: calculateTrustScoreMock,
  };
});

vi.mock("@/db/schema", () => ({
  reviews: {},
  bookings: {},
  services: {},
  providers: {},
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: any[]) => ({ type: "eq", args }),
  and: (...args: any[]) => ({ type: "and", args }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      bookings: {
        findFirst: vi.fn(async () => booking),
      },
      reviews: {
        findFirst: vi.fn(async () => null),
      },
      services: {
        findFirst: vi.fn(async () => null),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => ({
        returning: vi.fn(async () => [row]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: Record<string, unknown>) => {
        lastProviderSetPayload = payload;
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
  },
}));

describe("/api/reviews/create trust sync", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" });
    calculateTrustScoreMock.mockReset();
    calculateTrustScoreMock.mockResolvedValue(50);
    createNotificationMock.mockReset();
    lastProviderSetPayload = null;
  });

  it("persists both trustScore and trustLevel from boundary score 50", async () => {
    const { POST } = await import("@/app/api/reviews/create/route");
    const { getTrustTierFromScore } = await import("@/lib/trust");

    const res = await POST(
      new Request("http://localhost/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({
          bookingId: booking.id,
          rating: 5,
          comment: "Great work",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(lastProviderSetPayload).toMatchObject({
      trustScore: 50,
      trustLevel: getTrustTierFromScore(50),
    });
    expect(lastProviderSetPayload?.trustLevel).toBe("silver");
  });
});
