import { describe, expect, test } from "vitest";
import { getProviderStats } from "@/lib/provider-stats";
import { createProviderFixture, createBookingFixture, createServiceFixture, createConversationFixture, createMessageFixture } from "../utils/fixtures";
import { createProviderStatsClient } from "../utils/mock-db";

function minutesFrom(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

describe("getProviderStats", () => {
  test("computes completion, cancellation, repeats, services, and response time", async () => {
    const now = new Date("2024-04-01T00:00:00Z");
    const provider = createProviderFixture({ createdAt: new Date("2022-04-01T00:00:00Z") });

    const bookingRows = [
      createBookingFixture({ status: "completed", userId: "cust_1" }),
      createBookingFixture({ status: "completed", userId: "cust_1" }),
      createBookingFixture({ status: "canceled_provider", userId: "cust_2" }),
      createBookingFixture({ status: "pending", userId: "cust_3" }),
    ];

    const conversations = [createConversationFixture({ id: "convo_1", user1Id: provider.userId, user2Id: "cust_4" })];
    const firstMsg = minutesFrom(now, 0);
    const replyMsg = minutesFrom(now, 12);
    const messages = [
      createMessageFixture({ conversationId: "convo_1", senderId: bookingRows[0].userId, createdAt: firstMsg, bookingId: bookingRows[0].id }),
      createMessageFixture({ conversationId: "convo_1", senderId: provider.userId, createdAt: replyMsg, bookingId: bookingRows[0].id }),
    ];

    const services = [createServiceFixture(), createServiceFixture({ id: "svc_2" })];

    const client = createProviderStatsClient({ provider, bookingRows, services, conversations, messages });
    const stats = await getProviderStats(provider.id, client as any);

    expect(stats).toMatchObject({
      completionRate: 50,
      cancellationRate: 25,
      repeatCustomers: 1,
      totalServices: 2,
      avgResponseMinutes: 12,
      isVerified: true,
      trustLevel: "gold",
      trustScore: provider.trustScore,
    });
    expect(stats?.yearsActive).toBeGreaterThanOrEqual(2);
  });

  test("returns null when provider missing", async () => {
    const client = createProviderStatsClient({ provider: null });
    const stats = await getProviderStats("missing", client as any);
    expect(stats).toBeNull();
  });

  test("masks stats for suspended provider", async () => {
    const provider = createProviderFixture({ isSuspended: true });
    const client = createProviderStatsClient({ provider });
    const stats = await getProviderStats(provider.id, client as any);
    expect(stats).toEqual({
      completionRate: null,
      cancellationRate: null,
      avgResponseMinutes: null,
      repeatCustomers: 0,
      totalServices: 0,
      yearsActive: expect.any(Number),
      isVerified: provider.isVerified,
      trustLevel: provider.trustLevel,
      trustScore: provider.trustScore,
    });
  });
});
