import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn().mockResolvedValue({ isAdmin: true, userId: "admin_1" }) }));
vi.mock("@/db/schema", () => ({ disputes: {}, bookings: {} }));

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => [{ id: "disp_1", bookingId: "book_1", status: "under_review" }]) }))
    }))
  })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin disputes validation", () => {
  it("rejects invalid disputeId", async () => {
    const { POST } = await import("@/app/api/admin/disputes/[disputeId]/review/route");
    const res = await POST(new NextRequest("http://localhost/api/admin/disputes/not-uuid/review", { method: "POST" }), { params: Promise.resolve({ disputeId: "not-uuid" }) } as any);
    expect(res.status).toBe(400);
  });

  it("rejects resolve with missing fields", async () => {
    const { POST } = await import("@/app/api/admin/disputes/[disputeId]/resolve/route");
    const form = new FormData();
    form.set("adminNotes", "");
    const res = await POST(new NextRequest("http://localhost/api/admin/disputes/550e8400-e29b-41d4-a716-446655440000/resolve", { method: "POST", body: form as any }), { params: Promise.resolve({ disputeId: "550e8400-e29b-41d4-a716-446655440000" }) } as any);
    expect(res.status).toBe(400);
  });
});
