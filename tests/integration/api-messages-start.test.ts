import { describe, expect, test, vi } from "vitest";

import { POST } from "@/app/api/messages/start/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "user_customer" })),
}));

vi.mock("@/lib/messaging", () => ({
  canMessage: vi.fn(),
  ensureBookingRelationship: vi.fn(),
  sendBookingMessage: vi.fn(),
}));

const { canMessage, ensureBookingRelationship, sendBookingMessage } = await import("@/lib/messaging");

describe("/api/messages/start", () => {
  test("400 when missing bookingId and providerId", async () => {
    const req = new Request("http://localhost/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("resolves bookingId from providerId and returns conversationId", async () => {
    (ensureBookingRelationship as any).mockResolvedValue({ bookingId: "bk_123" });
    (canMessage as any).mockResolvedValue({ ok: true });

    const req = new Request("http://localhost/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "prov_1", serviceId: "svc_1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await (res as Response).json();
    expect(json).toEqual({ bookingId: "bk_123", conversationId: "bk_123" });
  });

  test("sends bootstrap message when content provided", async () => {
    (ensureBookingRelationship as any).mockResolvedValue({ bookingId: "bk_123" });
    (canMessage as any).mockResolvedValue({ ok: true });

    const req = new Request("http://localhost/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "prov_1", content: "Hi" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendBookingMessage).toHaveBeenCalledWith({ bookingId: "bk_123", senderId: "user_customer", content: "Hi" });
  });

  test("403 when canMessage denies", async () => {
    (canMessage as any).mockResolvedValue({ ok: false, reason: "Messaging unavailable" });

    const req = new Request("http://localhost/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "bk_1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
