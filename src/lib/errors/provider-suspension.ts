export type ProviderSuspendedPayload = {
  error: "PROVIDER_SUSPENDED";
  status: string;
  message: string;
  reason: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type ParsedProviderSuspendedPayload = {
  status: string;
  message: string;
  reason: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export const PROVIDER_SUSPENDED_EVENT = "provider:limited_mode";

export class ProviderLimitedModeHandledError extends Error {
  name = "ProviderLimitedModeHandledError";
  constructor() {
    super("Provider limited mode (handled)");
  }
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function extractCandidatePayload(err: unknown): unknown {
  const rec = asRecord(err);
  if (!rec) return err;

  // Common patterns:
  // - our fetch wrapper throws { payload }
  // - axios throws { response: { data } }
  // - some libs throw { data }
  if ("payload" in rec) return (rec as any).payload;
  if ("data" in rec) return (rec as any).data;

  const response = (rec as any).response;
  if (response && typeof response === "object") {
    if ("data" in response) return (response as any).data;
  }

  return err;
}

export function parseProviderSuspendedPayload(err: unknown): ParsedProviderSuspendedPayload | null {
  const candidate = extractCandidatePayload(err);
  const rec = asRecord(candidate);
  if (!rec) return null;

  if (rec.error !== "PROVIDER_SUSPENDED") return null;

  const status = typeof rec.status === "string" ? rec.status : "limited";
  const message = typeof rec.message === "string" ? rec.message : "Your account is in limited mode and cannot perform this action.";
  const reason = typeof rec.reason === "string" ? rec.reason : null;
  const startsAt = parseIsoDate(rec.startsAt);
  const endsAt = parseIsoDate(rec.endsAt);

  return { status, message, reason, startsAt, endsAt };
}

export function isProviderSuspendedError(err: unknown): boolean {
  return parseProviderSuspendedPayload(err) !== null;
}

export function isProviderLimitedModeHandledError(err: unknown): boolean {
  return err instanceof ProviderLimitedModeHandledError;
}

export function dispatchProviderLimitedMode(payload: ParsedProviderSuspendedPayload) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(PROVIDER_SUSPENDED_EVENT, { detail: payload }));
  } catch {
    // ignore
  }
}
