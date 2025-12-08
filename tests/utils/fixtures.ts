import { addDays } from "date-fns";

export function createProviderFixture(overrides: Partial<any> = {}) {
  return {
    id: "prov_1",
    userId: "user_1",
    createdAt: new Date("2023-01-01T00:00:00Z"),
    isVerified: true,
    trustLevel: "gold",
    trustScore: 78,
    isSuspended: false,
    status: "approved",
    baseRegion: "auckland",
    ...overrides,
  };
}

export function createServiceFixture(overrides: Partial<any> = {}) {
  return {
    id: "svc_1",
    providerId: "prov_1",
    provider: null,
    title: "Premium Cleaning",
    slug: "premium-cleaning",
    description: "Test service",
    priceInCents: 15000,
    category: "cleaning",
    coverImageUrl: null,
    createdAt: new Date("2024-01-10T00:00:00Z"),
    ...overrides,
  };
}

export function createBookingFixture(overrides: Partial<any> = {}) {
  return {
    id: `bk_${Math.random().toString(36).slice(2, 7)}`,
    userId: "cust_1",
    serviceId: "svc_1",
    providerId: "prov_1",
    status: "completed",
    scheduledDate: addDays(new Date(), 2),
    priceAtBooking: 12000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createReviewFixture(overrides: Partial<any> = {}) {
  return {
    id: `rev_${Math.random().toString(36).slice(2, 7)}`,
    userId: "cust_1",
    providerId: "prov_1",
    bookingId: "bk_1",
    serviceId: "svc_1",
    rating: 5,
    comment: "Great service",
    isHidden: false,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createConversationFixture(overrides: Partial<any> = {}) {
  return {
    id: `convo_${Math.random().toString(36).slice(2, 7)}`,
    user1Id: "user_1",
    user2Id: "cust_1",
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMessageFixture(overrides: Partial<any> = {}) {
  return {
    id: `msg_${Math.random().toString(36).slice(2, 7)}`,
    conversationId: overrides.conversationId ?? "convo_1",
    senderId: overrides.senderId ?? "cust_1",
    createdAt: overrides.createdAt ?? new Date(),
    ...overrides,
  };
}
