import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const createNotificationMock = vi.fn();
const calculateTrustScoreMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/notifications", () => ({ createNotification: createNotificationMock }));
vi.mock("@/lib/trust", () => ({ calculateTrustScore: calculateTrustScoreMock }));

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
  or: (...args: any[]) => ({ type: "or", args }),
  desc: (value: any) => ({ type: "desc", value }),
  sql: (...args: any[]) => ({ type: "sql", args }),
}));

const state = {
  booking: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    status: "completed",
    providerId: "73f3e1f2-4c9d-4c5d-9f3a-0d6c1f4ea000",
    serviceId: "1c8a1c21-3c9e-4d0a-b6ff-2f3aa0b0c000",
  } as any,
  existingReview: null as any,
  listItems: [{ id: "rev_1", rating: 5 }] as any[],
  stats: { count: 1, avgRating: 5 } as any,
  breakdownRows: [{ rating: 5, count: 1 }] as any[],
};

function resetState() {
  state.booking = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    status: "completed",
    providerId: "73f3e1f2-4c9d-4c5d-9f3a-0d6c1f4ea000",
    serviceId: "1c8a1c21-3c9e-4d0a-b6ff-2f3aa0b0c000",
  } as any;
  state.existingReview = null;
  state.listItems = [{ id: "rev_1", rating: 5 }] as any[];
  state.stats = { count: 1, avgRating: 5 } as any;
  state.breakdownRows = [{ rating: 5, count: 1 }] as any[];
}

function makeDb() {
  const baseBuilder: any = {
    leftJoin: () => baseBuilder,
    where: () => baseBuilder,
    orderBy: () => baseBuilder,
    limit: () => baseBuilder,
    offset: async () => state.listItems,
  };

  return {
    query: {
      bookings: {
        findFirst: async () => state.booking,
      },
      reviews: {
        findFirst: async () => state.existingReview,
      },
      services: {
        findFirst: async () => null,
      },
    },
    insert: () => ({
      values: (row: any) => ({
        returning: async () => [{ id: row.id ?? "rev_generated", ...row }],
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
    select: (shape: any) => {
      if (shape && Object.keys(shape).includes("count") && Object.keys(shape).includes("avgRating")) {
        return {
          from: () => {
            const builder: any = {
              leftJoin: () => builder,
              where: async () => [state.stats],
            };
            return builder;
          },
        };
      }

      if (shape && Object.keys(shape).includes("rating") && Object.keys(shape).includes("count")) {
        const builder: any = {
          leftJoin: () => builder,
          where: () => ({ groupBy: async () => state.breakdownRows }),
          groupBy: async () => state.breakdownRows,
        };
        return {
          from: () => ({
            leftJoin: () => builder,
          }),
        };
      }

      return {
        from: () => baseBuilder,
      };
    },
  };
}

vi.mock("@/lib/db", () => ({ db: makeDb(), __state: state }));

const validBody = {
  bookingId: state.booking.id,
  rating: 5,
  comment: "Great job!",
  tipAmount: 0,
};

describe("/api/reviews/create validation", () => {
  beforeEach(() => {
    resetState();
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" });
    createNotificationMock.mockReset();
    calculateTrustScoreMock.mockReset();
  });

  it("rejects invalid bookingId uuid", async () => {
    const { POST } = await import("@/app/api/reviews/create/route");
    const res = await POST(
      new Request("http://localhost/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({ ...validBody, bookingId: "not-a-uuid" }),
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid request" });
  });

  it("rejects rating below 1", async () => {
    const { POST } = await import("@/app/api/reviews/create/route");
    const res = await POST(
      new Request("http://localhost/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({ ...validBody, rating: 0 }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects rating above 5", async () => {
    const { POST } = await import("@/app/api/reviews/create/route");
    const res = await POST(
      new Request("http://localhost/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({ ...validBody, rating: 6 }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects overly long comment", async () => {
    const { POST } = await import("@/app/api/reviews/create/route");
    const res = await POST(
      new Request("http://localhost/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({ ...validBody, comment: "a".repeat(2001) }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects negative tipAmount", async () => {
    const { POST } = await import("@/app/api/reviews/create/route");
    const res = await POST(
      new Request("http://localhost/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({ ...validBody, tipAmount: -1 }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("allows empty comment and reaches success path", async () => {
    const { POST } = await import("@/app/api/reviews/create/route");
    const res = await POST(
      new Request("http://localhost/api/reviews/create", {
        method: "POST",
        body: JSON.stringify({ ...validBody, comment: "" }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ bookingId: validBody.bookingId });
  });
});

describe("/api/reviews/provider/[providerId] validation", () => {
  beforeEach(() => {
    resetState();
  });

  it("rejects invalid providerId", async () => {
    const { GET } = await import("@/app/api/reviews/provider/[providerId]/route");
    const req = new NextRequest("http://localhost/api/reviews/provider/not-a-uuid");
    const res = await GET(req as any, { params: Promise.resolve({ providerId: "not-a-uuid" }) } as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid request" });
  });

  it("rejects invalid pagination", async () => {
    const { GET } = await import("@/app/api/reviews/provider/[providerId]/route");
    const req = new NextRequest(
      `http://localhost/api/reviews/provider/${state.booking.providerId}?page=0&pageSize=200`
    );
    const res = await GET(req as any, { params: Promise.resolve({ providerId: state.booking.providerId }) } as any);
    expect(res.status).toBe(400);
  });

  it("applies pagination defaults", async () => {
    const { GET } = await import("@/app/api/reviews/provider/[providerId]/route");
    const req = new NextRequest(`http://localhost/api/reviews/provider/${state.booking.providerId}`);
    const res = await GET(req as any, { params: Promise.resolve({ providerId: state.booking.providerId }) } as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.page).toBe(1);
    expect(json.pageSize).toBe(10);
  });
});

describe("/api/reviews/service/[serviceId] validation", () => {
  beforeEach(() => {
    resetState();
  });

  it("rejects invalid serviceId", async () => {
    const { GET } = await import("@/app/api/reviews/service/[serviceId]/route");
    const req = new NextRequest("http://localhost/api/reviews/service/not-a-uuid");
    const res = await GET(req as any, { params: Promise.resolve({ serviceId: "not-a-uuid" }) } as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid request" });
  });

  it("rejects invalid pagination", async () => {
    const { GET } = await import("@/app/api/reviews/service/[serviceId]/route");
    const req = new NextRequest(
      `http://localhost/api/reviews/service/${state.booking.serviceId}?page=0&pageSize=200`
    );
    const res = await GET(req as any, { params: Promise.resolve({ serviceId: state.booking.serviceId }) } as any);
    expect(res.status).toBe(400);
  });

  it("applies pagination defaults", async () => {
    const { GET } = await import("@/app/api/reviews/service/[serviceId]/route");
    const req = new NextRequest(`http://localhost/api/reviews/service/${state.booking.serviceId}`);
    const res = await GET(req as any, { params: Promise.resolve({ serviceId: state.booking.serviceId }) } as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.page).toBe(1);
    expect(json.pageSize).toBe(10);
  });
});
