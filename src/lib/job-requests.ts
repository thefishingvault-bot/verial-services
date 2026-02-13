import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { conversations, jobPayments, reviews, users } from "@/db/schema";
import { getProviderPlatformFeeBps } from "@/lib/payments/platform-fee";
import { normalizeProviderPlan } from "@/lib/provider-subscription";

export type JobLifecycleStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "completed"
  | "closed"
  | "cancelled"
  | "expired";

export type JobPaymentType = "deposit" | "remainder" | "full";

export function isFullPaymentModeEnabled() {
  const raw = process.env.FULL_PAYMENT_MODE;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function assertJobTransition(current: JobLifecycleStatus, next: JobLifecycleStatus) {
  const allowed: Record<JobLifecycleStatus, JobLifecycleStatus[]> = {
    open: ["assigned", "cancelled", "expired"],
    assigned: ["in_progress", "cancelled"],
    in_progress: ["completed"],
    completed: ["closed"],
    closed: [],
    cancelled: [],
    expired: [],
  };

  if (!allowed[current]?.includes(next)) {
    throw new Error(`Invalid transition ${current} -> ${next}`);
  }
}

export function calculateChargeBreakdown(params: {
  totalPrice: number;
  providerPlan: unknown;
  paymentType: JobPaymentType;
  priorPlatformFeeCollected?: number;
}) {
  const totalPrice = Math.max(0, Math.trunc(params.totalPrice));
  const plan = normalizeProviderPlan(params.providerPlan);
  const bps = getProviderPlatformFeeBps(plan);
  const totalPlatformFee = Math.round((totalPrice * bps) / 10000);

  let amountTotal = totalPrice;
  if (params.paymentType === "deposit") {
    amountTotal = Math.max(1, Math.round(totalPrice * 0.3));
  }

  if (params.paymentType === "remainder") {
    const depositAmount = Math.max(0, Math.round(totalPrice * 0.3));
    amountTotal = Math.max(0, totalPrice - depositAmount);
  }

  let platformFeeAmount = Math.round((amountTotal * bps) / 10000);
  if (params.paymentType === "remainder") {
    const alreadyCollected = Math.max(0, Math.trunc(params.priorPlatformFeeCollected ?? 0));
    platformFeeAmount = Math.max(0, totalPlatformFee - alreadyCollected);
  }

  const providerAmount = Math.max(0, amountTotal - platformFeeAmount);

  return {
    providerTier: plan,
    platformFeeBps: bps,
    amountTotal,
    platformFeeAmount,
    providerAmount,
    totalPlatformFee,
  };
}

export async function sumCollectedPlatformFees(jobRequestId: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${jobPayments.platformFeeAmount}), 0)` })
    .from(jobPayments)
    .where(
      and(
        eq(jobPayments.jobRequestId, jobRequestId),
        eq(jobPayments.paymentStatus, "deposit_paid"),
      ),
    );

  return Number(row?.total ?? 0);
}

export async function getProviderRatingAverage(providerId: string): Promise<number> {
  const [row] = await db
    .select({ avg: sql<number>`coalesce(avg(${reviews.rating}), 0)` })
    .from(reviews)
    .where(eq(reviews.providerId, providerId));

  return Number(row?.avg ?? 0);
}

export function scoreQuote(params: {
  rating: number;
  amountTotal: number;
  minAmount: number;
  maxAmount: number;
  responseSpeedHours: number | null;
  maxResponseHours: number;
}) {
  const normalizedRating = Math.max(0, Math.min(5, params.rating)) / 5;

  const priceRange = Math.max(1, params.maxAmount - params.minAmount);
  const priceCompetitiveness = 1 - (params.amountTotal - params.minAmount) / priceRange;
  const availabilityHours = Math.max(1, params.responseSpeedHours ?? params.maxResponseHours);
  const availabilitySpeed = 1 - Math.min(1, availabilityHours / Math.max(1, params.maxResponseHours));
  const responseSpeed = availabilitySpeed;

  return (
    normalizedRating * 0.4 +
    Math.max(0, Math.min(1, priceCompetitiveness)) * 0.2 +
    availabilitySpeed * 0.2 +
    responseSpeed * 0.2
  );
}

export async function ensureConversationExists(userOneId: string, userTwoId: string) {
  const [a, b] = [userOneId, userTwoId].sort((x, y) => x.localeCompare(y));

  const existing = await db.query.conversations.findFirst({
    where: and(eq(conversations.userAId, a), eq(conversations.userBId, b)),
    columns: { id: true },
  });

  if (existing) return existing.id;

  const [userA, userB] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, a), columns: { id: true } }),
    db.query.users.findFirst({ where: eq(users.id, b), columns: { id: true } }),
  ]);

  if (!userA || !userB) return null;

  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  await db.insert(conversations).values({
    id,
    userAId: a,
    userBId: b,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  }).onConflictDoNothing();

  return id;
}
