type PresenceStatus = "online" | "away" | "busy" | "offline";
export type PresenceRecord = { status: PresenceStatus; lastActive: number };

const kvBase = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;
const memoryPresence = new Map<string, PresenceRecord>();
const PRESENCE_TTL_SECONDS = 5 * 60;

async function kvSet(key: string, value: PresenceRecord, ttlSeconds: number) {
  if (!kvBase || !kvToken) return;
  try {
    await fetch(`${kvBase}/set/${key}/${encodeURIComponent(JSON.stringify(value))}?ex=${ttlSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch (error) {
    console.warn("[presence] kv set failed", error);
  }
}

async function kvGet(key: string) {
  if (!kvBase || !kvToken) return null;
  try {
    const res = await fetch(`${kvBase}/get/${key}`, { headers: { Authorization: `Bearer ${kvToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data?.result) return null;
    return JSON.parse(data.result) as PresenceRecord;
  } catch (error) {
    console.warn("[presence] kv get failed", error);
    return null;
  }
}

export async function setPresence(userId: string, status: PresenceStatus) {
  const record: PresenceRecord = { status, lastActive: Date.now() };
  memoryPresence.set(userId, record);
  await kvSet(`presence:${userId}`, record, PRESENCE_TTL_SECONDS);
}

export async function getPresence(userIds: string[]) {
  const results: Record<string, PresenceRecord> = {};
  for (const userId of userIds) {
    const mem = memoryPresence.get(userId);
    if (mem && Date.now() - mem.lastActive < PRESENCE_TTL_SECONDS * 1000) {
      results[userId] = mem;
      continue;
    }
    const kv = await kvGet(`presence:${userId}`);
    if (kv) {
      results[userId] = kv;
      memoryPresence.set(userId, kv);
    }
  }
  return results;
}
