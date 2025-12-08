import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { providerTimeOffs, providers, reviews, serviceFavorites, services } from "@/db/schema";
import { createProviderFixture, createServiceFixture, createReviewFixture } from "../utils/fixtures";

function makeDbMock(opts: { service: any; reviews: any[]; timeOffs?: any[] }) {
  const { service } = opts;
  const timeOffs = opts.timeOffs ?? [];
  const reviewRows = opts.reviews;
  let selectCall = 0;
  const isTable = (tbl: any, target: any) => {
    if (!tbl || !target) return false;
    if (tbl === target) return true;
    const targetNames = [
      (target as any).tableName,
      (target as any).name,
      (target as any)._name,
    ].filter(Boolean);
    const tableNames = [(tbl as any).tableName, (tbl as any).name, (tbl as any)._name].filter(Boolean);
    return tableNames.some((n) => targetNames.includes(n));
  };

  return {
    query: {
      services: {
        findFirst: async () => service,
      },
      providerTimeOffs: {
        findMany: async () => timeOffs,
      },
    },
    select: (shape?: any) => ({
      from: (table: any) => {
        const isServiceShape = shape && "providerId" in shape && "favoriteCount" in shape;
        if (isTable(table, services) || isServiceShape) {
          const visible = reviewRows.filter((r) => !r.isHidden);
          const count = visible.length;
          const avgRating = count ? visible.reduce((a, b) => a + b.rating, 0) / count : 0;
          const row = {
            id: service.id,
            slug: service.slug,
            title: service.title,
            description: service.description,
            priceInCents: service.priceInCents,
            category: service.category,
            coverImageUrl: service.coverImageUrl ?? null,
            chargesGst: service.chargesGst ?? false,
            createdAt: service.createdAt ?? new Date(),
            providerId: service.provider.id,
            providerUserId: service.provider.userId ?? null,
            providerHandle: service.provider.handle ?? null,
            providerBusinessName: service.provider.businessName ?? null,
            providerBio: service.provider.bio ?? null,
            providerTrustLevel: service.provider.trustLevel,
            providerTrustScore: service.provider.trustScore ?? 0,
            providerVerified: service.provider.isVerified ?? false,
            providerBaseSuburb: service.provider.baseSuburb ?? null,
            providerBaseRegion: service.provider.baseRegion ?? null,
            providerRadius: service.provider.serviceRadiusKm ?? null,
            avgRating,
            reviewCount: count,
            favoriteCount: 0,
            isFavorited: false,
          };

          return {
            innerJoin: () => ({
              leftJoin: () => ({
                leftJoin: () => ({
                  where: () => ({
                    groupBy: () => ({
                      limit: async () => [row],
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (isTable(table, reviews) || (!isTable(table, services) && !isTable(table, providerTimeOffs) && !isServiceShape)) {
          const visible = reviewRows.filter((r) => !r.isHidden);
          const count = visible.length;
          const average = count ? visible.reduce((a, b) => a + b.rating, 0) / count : 0;
          const grouped: Record<number, number> = {};
          visible.forEach((r) => {
            grouped[r.rating] = (grouped[r.rating] ?? 0) + 1;
          });

          const withGroupBy = (rows: any) => {
            const arr: any = rows;
            arr.groupBy = async () => Object.entries(grouped).map(([rating, count]) => ({ rating: Number(rating), count }));
            return arr;
          };

          return {
            where: () => withGroupBy([{ average, total: count }]),
            leftJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: async () =>
                    visible
                      .slice(0, 10)
                      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                      .map((r) => ({
                        id: r.id,
                        rating: r.rating,
                        comment: r.comment,
                        createdAt: r.createdAt,
                        isHidden: r.isHidden ?? false,
                        firstName: r.user?.firstName ?? "",
                        lastName: r.user?.lastName ?? "",
                      })),
                }),
              }),
            }),
          };
        }

        if (isTable(table, providerTimeOffs)) {
          return {
            where: async () => timeOffs.map((t) => ({ start: t.startTime, end: t.endTime })),
          };
        }

        const emptyChain = {
          innerJoin: () => emptyChain,
          leftJoin: () => emptyChain,
          where: () => ({
            groupBy: () => ({
              limit: async () => [],
            }),
          }),
        };
        return emptyChain;
      },
    }),
  };
}

describe("Service detail page", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("renders key sections and metadata with visible reviews only", async () => {
    const provider = createProviderFixture({
      handle: "sparkle",
      businessName: "Sparkle Co",
      baseRegion: "Auckland",
      baseSuburb: "Ponsonby",
      serviceRadiusKm: 25,
      trustLevel: "gold",
      trustScore: 90,
      isVerified: true,
    });

    const service = createServiceFixture({
      providerId: provider.id,
      provider,
      title: "Deep Clean",
      slug: "deep-clean",
      description: "Full house clean",
      category: "cleaning",
      priceInCents: 20000,
    });

    const reviewRows = [
      createReviewFixture({ id: "rev_visible", rating: 5, comment: "Great", createdAt: new Date("2024-02-01"), user: { firstName: "Ana", lastName: "Lee" } as any }),
      createReviewFixture({ id: "rev_hidden", rating: 3, comment: "Hidden", isHidden: true, createdAt: new Date("2024-01-01"), user: { firstName: "Bob", lastName: "H" } as any }),
    ];

    const dbMock = makeDbMock({ service, reviews: reviewRows, timeOffs: [{ startTime: new Date("2030-01-01"), endTime: new Date("2030-01-02") }] });

    vi.doMock("@/lib/db", () => ({ db: dbMock }));
    vi.doMock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: "user_test" }) }));
    vi.doMock("@/lib/provider-stats", () => ({ getProviderStats: vi.fn().mockResolvedValue({ completionRate: 50, cancellationRate: 10, repeatCustomers: 2, totalServices: 3, avgResponseMinutes: 12, yearsActive: 1, isVerified: true, trustLevel: "gold", trustScore: 90 }) }));
    vi.doMock("@/lib/similar-services", () => ({ getSimilarServices: vi.fn().mockResolvedValue([{ id: "svc_x", slug: "svc-x", title: "Alt", priceInCents: 10000, category: "cleaning", providerBusinessName: "Alt Biz", providerRegion: "Auckland", providerTrustScore: 70, providerVerified: true, coverImageUrl: null, createdAt: new Date("2024-01-01"), description: "", avgRating: 4.2, reviewCount: 4, favoriteCount: 0, providerId: "prov_x", providerHandle: "prov_x" }]) }));

    vi.doMock("@/components/common/contact-button", () => ({ ContactButton: () => <div data-testid="contact-button" /> }));
    vi.doMock("@/components/favorites/favorite-button", () => ({ FavoriteButton: () => <div data-testid="favorite-button" /> }));
    vi.doMock("@/components/services/detail/review-summary", () => ({ ReviewSummary: ({ averageRating, totalReviews }: any) => <div data-testid="review-summary">{averageRating}-{totalReviews}</div> }));
    vi.doMock("@/components/services/detail/review-list", () => ({ ReviewList: ({ initialItems }: any) => <div data-testid="review-list">{initialItems.length}</div> }));
    vi.doMock("@/components/services/detail/provider-stats-card", () => ({ ProviderStatsCard: ({ stats }: any) => <div data-testid="provider-stats">{stats.totalServices}</div> }));
    vi.doMock("@/components/services/detail/service-booking-panel", () => ({ ServiceBookingPanel: ({ nextAvailableDate }: any) => <div data-testid="booking-panel">{nextAvailableDate?.toISOString()}</div> }));
    vi.doMock("@/components/services/detail/similar-services-grid", () => ({ SimilarServicesGrid: ({ services }: any) => <div data-testid="similar-services">{services.length}</div> }));

    const module = await import("@/app/s/[slug]/page");

    const metadata = await module.generateMetadata({ params: { slug: service.slug } });
    expect(metadata).toBeDefined();

    const html = renderToStaticMarkup(await module.default({ params: { slug: service.slug } }) as any);

    expect(html).toContain("Deep Clean");
    expect(html).toContain("Sparkle Co");
    expect(html).toContain('review-summary">5-1');
    expect(html).not.toContain("rev_hidden");
    expect(html).toContain('similar-services">1');
    expect(html).toContain("booking-panel");
  });
});
