import crypto from "crypto";

const kvConfig = () => ({
  base: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

interface Stored<T> {
  value: T;
  expiresAt: number;
}

const memoryStore = new Map<string, Stored<unknown>>();

async function kvGet<T>(key: string): Promise<Stored<T> | null> {
  const { base, token } = kvConfig();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data?.result) return null;
    return JSON.parse(data.result) as Stored<T>;
  } catch (error) {
    console.warn("[idempotency] kv get failed", error);
    return null;
  }
}

async function kvSet<T>(key: string, value: Stored<T>, ttlSeconds: number) {
  const { base, token } = kvConfig();
  if (!base || !token) return;
  try {
    await fetch(`${base}/set/${key}/${encodeURIComponent(JSON.stringify(value))}?ex=${ttlSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.warn("[idempotency] kv set failed", error);
  }
}

export async function withIdempotency<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cacheKey = `idem:${key}`;
  const existing = (await kvGet<T>(cacheKey)) ?? (memoryStore.get(cacheKey) as Stored<T> | undefined) ?? null;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await fn();
  const record: Stored<T> = { value, expiresAt: now + ttlSeconds * 1000 };
  memoryStore.set(cacheKey, record);
  await kvSet(cacheKey, record, ttlSeconds);
  return value;
}

const sanitizeSegment = (segment: string | null | undefined) => (segment && segment.length > 0 ? segment : "none");

export const hashPayload = (payload: unknown): string => {
  try {
    const normalized = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    return crypto.createHash("sha256").update(normalized).digest("hex");
  } catch {
    return crypto.createHash("sha256").update("fallback").digest("hex");
  }
};

export const bookingIdempotencyKey = (
  action: string,
  userId: string | null | undefined,
  bookingId?: string | null,
  payload?: unknown,
) => {
  const resource = sanitizeSegment(bookingId ?? (payload ? hashPayload(payload) : null));
  return `booking:${sanitizeSegment(action)}:${sanitizeSegment(userId)}:${resource}`;
};

export const messageIdempotencyKey = (
  threadId: string,
  id: string | null | undefined,
  payload?: unknown,
) => `msg:${sanitizeSegment(threadId)}:${sanitizeSegment(id ?? (payload ? hashPayload(payload) : null))}`;

export const notificationIdempotencyKey = (
  event: string,
  bookingId: string | null | undefined,
  userId: string | null | undefined,
) => `notify:${sanitizeSegment(event)}:${sanitizeSegment(bookingId)}:${sanitizeSegment(userId)}`;

export function clearIdempotencyCache() {
  memoryStore.clear();
}
