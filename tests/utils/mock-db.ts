import { bookings, conversations, messages, providers, services, reviews, serviceFavorites } from "@/db/schema";

// Minimal fake client for provider stats helper
export function createProviderStatsClient(data: {
  provider: any | null;
  bookingRows?: any[];
  services?: any[];
  conversations?: any[];
  messages?: any[];
}) {
  let bookingSelectCall = 0;

  return {
    query: {
      providers: {
        findFirst: async () => data.provider,
      },
    },
    select: () => ({
      from: (table: any) => {
        if (table === bookings) {
          bookingSelectCall += 1;
          if (bookingSelectCall === 1) {
            return {
              where: async () => {
                const rows = data.bookingRows ?? [];
                const total = rows.length;
                const completed = rows.filter((b) => b.status === "completed").length;
                const providerCanceled = rows.filter((b) => b.status === "canceled_provider").length;
                return [
                  {
                    total,
                    completed,
                    providerCanceled,
                  },
                ];
              },
            };
            }

            if (bookingSelectCall === 3) {
              return {
                where: () => ({
                  limit: async () => (data.bookingRows ?? []).slice(0, 50),
                }),
              };
          }

          // Repeat customers call
          return {
            where: () => ({
              groupBy: () => ({
                having: async () => {
                  const rows = data.bookingRows ?? [];
                  const grouped: Record<string, number> = {};
                  rows.forEach((b) => {
                    grouped[b.userId] = (grouped[b.userId] ?? 0) + 1;
                  });
                  return Object.entries(grouped)
                    .filter(([, count]) => count >= 2)
                    .map(([userId, total]) => ({ userId, total }));
                },
              }),
            }),
          };
        }

        if (table === services) {
          return {
            where: async () => [{ totalServices: (data.services ?? []).length }],
          };
        }

        if (table === conversations) {
          return {
            where: () => ({
              limit: async () => data.conversations?.slice(0, 30) ?? [],
            }),
          };
        }

        if (table === messages) {
          return {
            where: (cond?: any) => ({
              orderBy: async () => {
                const rows = (data.messages ?? []).slice();
                const bookingIds = cond?.value?.[1] ?? [];
                const filtered = bookingIds.length > 0
                  ? rows.filter((m) => bookingIds.includes(m.bookingId))
                  : rows;
                return filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
              },
            }),
          };
        }

        return { where: async () => [] };
      },
    }),
  };
}

export function createSimilarServicesClient(data: {
  baseService: any | null;
  rows: any[];
}) {
  return {
    query: {
      services: {
        findFirst: async () => data.baseService,
      },
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  limit: async (_limit: number) => {
                    if (!data.baseService) return [];
                    return (data.rows ?? [])
                      .filter((row) => row.id !== data.baseService.id)
                      .filter((row) => row.category === data.baseService.category)
                      .filter((row) => row.providerRegion === data.baseService.provider.baseRegion)
                      .filter((row) => row.providerVerified !== undefined ? true : true)
                      .filter((row) => row.providerSuspended ? false : true);
                  },
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

export function createOgRouteClient(data: {
  service: any | null;
  rating?: number;
  reviewCount?: number;
}) {
  return {
    query: {
      services: {
        findFirst: async () => data.service,
      },
    },
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: async () => [
            {
              avgRating: data.rating ?? 0,
              totalReviews: data.reviewCount ?? 0,
            },
          ],
        }),
      }),
    }),
  };
}
