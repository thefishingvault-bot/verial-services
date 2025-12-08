import { NextResponse } from "next/server";

const kvConfig = () => ({
  base: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

interface WindowState {
  count: number;
  reset: number; // epoch ms
}

const memoryBuckets = new Map<string, WindowState>();

const now = () => Date.now();

async function kvGet(key: string): Promise<WindowState | null> {
  const { base, token } = kvConfig();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data?.result) return null;
    return JSON.parse(data.result) as WindowState;
  } catch (error) {
    console.warn("[rate-limit] kv get failed", error);
    return null;
  }
}

async function kvSet(key: string, value: WindowState, ttlSeconds: number) {
  const { base, token } = kvConfig();
  if (!base || !token) return;
  try {
    await fetch(`${base}/set/${key}/${encodeURIComponent(JSON.stringify(value))}?ex=${ttlSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.warn("[rate-limit] kv set failed", error);
  }
}

export interface RateLimitParams {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  retryAfter: number;
}

async function readWindow(key: string): Promise<WindowState | null> {
  const kvValue = await kvGet(key);
  if (kvValue) return kvValue;
  const mem = memoryBuckets.get(key) || null;
  if (mem && mem.reset > now()) return mem;
  return null;
}

async function writeWindow(key: string, state: WindowState, windowSeconds: number) {
  memoryBuckets.set(key, state);
  await kvSet(key, state, windowSeconds);
}

export async function rateLimit(params: RateLimitParams): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = params;
  const current = await readWindow(key);
  const nowMs = now();
  if (current && current.reset > nowMs && current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.reset - nowMs) / 1000));
    return { success: false, retryAfter };
  }

  const reset = current && current.reset > nowMs ? current.reset : nowMs + windowSeconds * 1000;
  const nextCount = current && current.reset > nowMs ? current.count + 1 : 1;
  const nextState: WindowState = { count: nextCount, reset };
  await writeWindow(key, nextState, windowSeconds);
  return { success: true, retryAfter: 0 };
}

export const checkRateLimit = rateLimit;

export function rateLimitResponse(retryAfter: number) {
  return NextResponse.json({ error: "Rate limit exceeded", retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}

export function identifierFromRequest(req: Request, userId?: string | null) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "unknown";
  return userId ? `u:${userId}` : `ip:${ip}`;
}

export async function enforceRateLimit(req: Request, opts: { userId?: string | null; resource: string; limit: number; windowSeconds: number }) {
  const idPart = identifierFromRequest(req, opts.userId);
  const key = `rl:${opts.resource}:${idPart}`;
  return rateLimit({ key, limit: opts.limit, windowSeconds: opts.windowSeconds });
}

export function clearRateLimitMemory() {
  memoryBuckets.clear();
}
