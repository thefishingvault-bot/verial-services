import { describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/services/similar/[serviceId]/route";
import { getSimilarServices } from "@/lib/similar-services";

vi.mock("@/lib/similar-services", () => ({
  getSimilarServices: vi.fn(),
}));

describe("/api/services/similar/[serviceId]", () => {
  test("returns list", async () => {
    (getSimilarServices as any).mockResolvedValue([{ id: "a", slug: "a" }]);
    const res = await GET(new Request("http://localhost/api/services/similar/svc_1"), { params: { serviceId: "svc_1" } });
    const json = await (res as Response).json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ items: [{ id: "a", slug: "a" }] });
  });

  test("404 when helper returns null", async () => {
    (getSimilarServices as any).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/services/similar/missing"), { params: { serviceId: "missing" } });
    expect(res.status).toBe(404);
  });

  test("validates missing serviceId", async () => {
    const res = await GET(new Request("http://localhost/api/services/similar/"), { params: { serviceId: "" as any } });
    expect(res.status).toBe(400);
  });
});
