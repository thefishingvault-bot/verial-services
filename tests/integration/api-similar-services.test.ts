import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/services/similar/[serviceId]/route";
import { getSimilarServices } from "@/lib/similar-services";

vi.mock("@/lib/similar-services", () => ({
  getSimilarServices: vi.fn(),
}));

describe("/api/services/similar/[serviceId]", () => {
  test("returns list", async () => {
    (getSimilarServices as any).mockResolvedValue([{ id: "a", slug: "a" }]);
    const req = new NextRequest("http://localhost/api/services/similar/svc_1");
    const res = await GET(req, { params: Promise.resolve({ serviceId: "svc_1" }) });
    const json = await (res as Response).json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ items: [{ id: "a", slug: "a" }] });
  });

  test("404 when helper returns null", async () => {
    (getSimilarServices as any).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/services/similar/missing");
    const res = await GET(req, { params: Promise.resolve({ serviceId: "missing" }) });
    expect(res.status).toBe(404);
  });

  test("validates missing serviceId", async () => {
    const req = new NextRequest("http://localhost/api/services/similar/");
    const res = await GET(req, { params: Promise.resolve({ serviceId: "" as any }) });
    expect(res.status).toBe(400);
  });
});
