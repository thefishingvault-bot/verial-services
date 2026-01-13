import { db } from "@/lib/db";
import { providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export type ProviderAccessStatus = "active" | "limited";

export type ProviderAccessState = {
  status: ProviderAccessStatus;
  reason: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

type ProviderSuspensionSnapshot = Pick<
  typeof providers.$inferSelect,
  "id" | "isSuspended" | "suspensionReason" | "suspensionStartDate" | "suspensionEndDate"
>;

function normalizeReason(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function getProviderAccessStateFromProvider(
  provider: ProviderSuspensionSnapshot,
  now: Date = new Date(),
): ProviderAccessState {
  const startsAt = provider.suspensionStartDate ? new Date(provider.suspensionStartDate) : null;
  const endsAt = provider.suspensionEndDate ? new Date(provider.suspensionEndDate) : null;

  if (!provider.isSuspended) {
    return { status: "active", reason: null, startsAt, endsAt };
  }

  // Scheduled suspension in the future: treat as active until it starts.
  if (startsAt && startsAt.getTime() > now.getTime()) {
    return { status: "active", reason: null, startsAt, endsAt };
  }

  // Expired suspension: treat as active.
  if (endsAt && endsAt.getTime() <= now.getTime()) {
    return { status: "active", reason: null, startsAt, endsAt };
  }

  return {
    status: "limited",
    reason: normalizeReason(provider.suspensionReason),
    startsAt,
    endsAt,
  };
}

export async function getProviderAccessState(providerId: string, now: Date = new Date()) {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, providerId),
    columns: {
      id: true,
      isSuspended: true,
      suspensionReason: true,
      suspensionStartDate: true,
      suspensionEndDate: true,
    },
  });

  if (!provider) return null;
  return getProviderAccessStateFromProvider(provider as ProviderSuspensionSnapshot, now);
}

export async function getProviderAccessStateForUserId(userId: string, now: Date = new Date()) {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: {
      id: true,
      isSuspended: true,
      suspensionReason: true,
      suspensionStartDate: true,
      suspensionEndDate: true,
    },
  });

  if (!provider) return null;

  return {
    providerId: provider.id,
    state: getProviderAccessStateFromProvider(provider as ProviderSuspensionSnapshot, now),
  };
}

export function providerSuspendedPayload(state: ProviderAccessState) {
  const endsAt = state.endsAt ? state.endsAt.toISOString() : null;
  const startsAt = state.startsAt ? state.startsAt.toISOString() : null;

  return {
    error: "PROVIDER_SUSPENDED" as const,
    status: state.status,
    message:
      state.status === "limited"
        ? "Your account is in limited mode and cannot perform this action."
        : "Your account is currently restricted.",
    reason: state.reason,
    endsAt,
    startsAt,
  };
}

export function providerSuspendedResponse(state: ProviderAccessState) {
  return NextResponse.json(providerSuspendedPayload(state), { status: 403 });
}

export function assertProviderCanTransactFromProvider(provider: ProviderSuspensionSnapshot, now: Date = new Date()) {
  const state = getProviderAccessStateFromProvider(provider, now);
  if (state.status === "active") return { ok: true as const, state };
  return { ok: false as const, state, response: providerSuspendedResponse(state) };
}

export async function assertProviderCanTransact(providerId: string, now: Date = new Date()) {
  const state = await getProviderAccessState(providerId, now);
  if (!state) {
    // Caller should handle missing provider separately.
    return { ok: true as const, state: { status: "active", reason: null, startsAt: null, endsAt: null } };
  }

  if (state.status === "active") return { ok: true as const, state };
  return { ok: false as const, state, response: providerSuspendedResponse(state) };
}
