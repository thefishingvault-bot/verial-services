import { db } from "@/lib/db";
import { bookings, messages, providers, services } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { differenceInYears } from "date-fns";

export type ProviderStats = {
  completionRate: number | null;
  cancellationRate: number | null;
  avgResponseMinutes: number | null;
  repeatCustomers: number;
  totalServices: number;
  yearsActive: number | null;
  isVerified: boolean;
  trustLevel: (typeof providers.trustLevel.enumValues)[number];
  trustScore: number;
};

export async function getProviderStats(providerId: string, client = db): Promise<ProviderStats | null> {
  const provider = await client.query.providers.findFirst({
    where: eq(providers.id, providerId),
    columns: {
      id: true,
      userId: true,
      createdAt: true,
      isVerified: true,
      trustLevel: true,
      trustScore: true,
      isSuspended: true,
    },
  });

  if (!provider) return null;

  if (provider.isSuspended) {
    const yearsActive = provider.createdAt
      ? Math.max(differenceInYears(new Date(), provider.createdAt), 0)
      : null;

    return {
      completionRate: null,
      cancellationRate: null,
      avgResponseMinutes: null,
      repeatCustomers: 0,
      totalServices: 0,
      yearsActive,
      isVerified: provider.isVerified,
      trustLevel: provider.trustLevel,
      trustScore: provider.trustScore,
    };
  }

  const [bookingStats] = await client
    .select({
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${bookings.status} = 'completed')`,
      providerCanceled: sql<number>`COUNT(*) FILTER (WHERE ${bookings.status} = 'canceled_provider')`,
    })
    .from(bookings)
    .where(eq(bookings.providerId, providerId));

  const repeatCustomers = await client
    .select({
      userId: bookings.userId,
      total: sql<number>`COUNT(*)`,
    })
    .from(bookings)
    .where(eq(bookings.providerId, providerId))
    .groupBy(bookings.userId)
    .having(sql`COUNT(*) >= 2`);

  const [serviceCountsRow] = await client
    .select({ totalServices: sql<number>`COUNT(*)` })
    .from(services)
    .where(eq(services.providerId, providerId));

  const completionRate = bookingStats?.total
    ? Number(((Number(bookingStats.completed || 0) / Number(bookingStats.total)) * 100).toFixed(1))
    : null;
  const cancellationRate = bookingStats?.total
    ? Number(((Number(bookingStats.providerCanceled || 0) / Number(bookingStats.total)) * 100).toFixed(1))
    : null;

  let avgResponseMinutes: number | null = null;
  if (provider.userId) {
    const providerBookings = await client
      .select({ id: bookings.id, userId: bookings.userId })
      .from(bookings)
      .where(eq(bookings.providerId, providerId))
      .limit(50);

    const bookingIds = providerBookings.map((b) => b.id);
    const bookingUserMap = new Map(providerBookings.map((b) => [b.id, b.userId]));

    if (bookingIds.length > 0) {
      const messageRows = await client
        .select({
          id: messages.id,
          bookingId: messages.bookingId,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(inArray(messages.bookingId, bookingIds))
        .orderBy(messages.bookingId, messages.createdAt);

      const responseDiffs: number[] = [];
      const messagesByBooking: Record<string, typeof messageRows> = {};
      for (const m of messageRows) {
        if (!messagesByBooking[m.bookingId]) messagesByBooking[m.bookingId] = [];
        messagesByBooking[m.bookingId].push(m);
      }

      for (const bookingId of Object.keys(messagesByBooking)) {
        const bookingMessages = messagesByBooking[bookingId];
        const customerId = bookingUserMap.get(bookingId);
        let firstCustomerMessage: Date | null = null;
        for (const msg of bookingMessages) {
          const isProvider = msg.senderId === provider.userId;
          const isCustomer = msg.senderId === customerId;
          if (isCustomer && !firstCustomerMessage) {
            firstCustomerMessage = msg.createdAt;
          }
          if (isProvider && firstCustomerMessage) {
            const diffMinutes = (msg.createdAt.getTime() - firstCustomerMessage.getTime()) / 1000 / 60;
            if (diffMinutes >= 0) {
              responseDiffs.push(diffMinutes);
            }
            break;
          }
        }
      }

      if (responseDiffs.length > 0) {
        const avg = responseDiffs.reduce((a, b) => a + b, 0) / responseDiffs.length;
        avgResponseMinutes = Number(avg.toFixed(1));
      }
    }
  }

  const yearsActive = provider.createdAt
    ? Math.max(differenceInYears(new Date(), provider.createdAt), 0)
    : null;

  return {
    completionRate,
    cancellationRate,
    avgResponseMinutes,
    repeatCustomers: repeatCustomers.length,
    totalServices: serviceCountsRow?.totalServices ?? 0,
    yearsActive,
    isVerified: provider.isVerified,
    trustLevel: provider.trustLevel,
    trustScore: provider.trustScore,
  };
}
