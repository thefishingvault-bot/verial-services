import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GET } from "@/app/api/og/service/[slug]/route";
import { NextRequest } from "next/server";
import { createServiceFixture, createProviderFixture } from "../utils/fixtures";
import { createOgRouteClient } from "../utils/mock-db";

const dbState = { client: createOgRouteClient({ service: null }) };

vi.mock("next/og", () => {
  class MockImageResponse {
    status = 200;
    headers = new Headers({ "content-type": "image/png" });
    body: string;
    options: any;
    constructor(tree: any, opts: any) {
      this.body = renderToStaticMarkup(tree as any);
      this.options = opts;
    }
  }
  return { ImageResponse: MockImageResponse };
});

vi.mock("@/lib/db", () => ({
  get db() {
    return dbState.client as any;
  },
}));

describe("/api/og/service/[slug]", () => {
  beforeEach(() => {
    dbState.client = createOgRouteClient({ service: null });
  });

  test("returns image with key text", async () => {
    const service = createServiceFixture({
      title: "Deluxe Clean",
      slug: "deluxe-clean",
      priceInCents: 15000,
      provider: createProviderFixture({ businessName: "Sparkle Co", isVerified: true }),
    });
    dbState.client = createOgRouteClient({ service, rating: 4.5, reviewCount: 12 });

    const res: any = await GET(new NextRequest("http://localhost/api/og/service/deluxe-clean"), { params: Promise.resolve({ slug: "deluxe-clean" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.body).toContain("Deluxe Clean");
    expect(res.body).toContain("NZ$ 150.00");
    expect(res.body).toMatch(/4\.5/);
  });

  test("404 when service missing", async () => {
    dbState.client = createOgRouteClient({ service: null });
    const res: any = await GET(new NextRequest("http://localhost/api/og/service/missing"), { params: Promise.resolve({ slug: "missing" }) });
    expect(res.status).toBe(404);
  });

  test("handles missing optional fields", async () => {
    const service = createServiceFixture({
      title: "No Biz",
      pricingType: "quote",
      priceInCents: null,
      provider: createProviderFixture({ businessName: null, isVerified: false }),
    });
    dbState.client = createOgRouteClient({ service, rating: 0, reviewCount: 0 });

    const res: any = await GET(new NextRequest("http://localhost/api/og/service/no-biz"), { params: Promise.resolve({ slug: "no-biz" }) });
    expect(res.status).toBe(200);
    expect(res.body).toContain("No Biz");
    expect(res.body).toContain("Quote required");
  });
});
