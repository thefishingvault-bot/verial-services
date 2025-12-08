import { db } from "@/lib/db";
import { notifications } from "@/db/schema";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { notificationIdempotencyKey, withIdempotency } from "./idempotency";

// Generate readable IDs to keep legacy shape intact.
const generateNotificationId = () =>
  `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export type NotificationRecord = typeof notifications.$inferSelect;

export interface CreateNotificationPayload {
  userId: string; // recipient
  title?: string;
  body?: string | null;
  message?: string; // legacy
  actionUrl?: string;
  href?: string; // legacy
  type?: string;
  bookingId?: string | null;
  serviceId?: string | null;
  providerId?: string | null;
  idempotencyKey?: string;
  ttlSeconds?: number;
}

const normalizeNotification = (payload: CreateNotificationPayload) => {
  const title = payload.title || payload.message || "Notification";
  const actionUrl = payload.actionUrl || payload.href || "/dashboard";
  return {
    id: generateNotificationId(),
    userId: payload.userId,
    type: payload.type || "system",
    title,
    body: payload.body ?? payload.message ?? null,
    actionUrl,
    message: payload.message || title,
    href: payload.href || actionUrl,
    bookingId: payload.bookingId ?? null,
    serviceId: payload.serviceId ?? null,
    providerId: payload.providerId ?? null,
  };
};

export const createNotification = async (payload: CreateNotificationPayload) => {
  try {
    const run = async () => {
      const data = normalizeNotification(payload);
      await db.insert(notifications).values(data);
      console.log(`[NOTIF_CREATED] user=${data.userId} title=${data.title}`);
      return data;
    };

    if (payload.idempotencyKey) {
      const ttlSeconds = payload.ttlSeconds ?? 60 * 60; // 1h default window for dedupe
      await withIdempotency(payload.idempotencyKey, ttlSeconds, run);
      return;
    }

    await run();
  } catch (error) {
    console.error("[NOTIF_ERROR] Failed to create notification:", error);
    // Do not throw; notification failure should not block the main request
  }
};

export async function createNotificationOnce(params: {
  event: string;
  bookingId?: string | null;
  userId: string;
  payload: Omit<CreateNotificationPayload, "userId">;
  ttlSeconds?: number;
}) {
  const key = notificationIdempotencyKey(params.event, params.bookingId ?? null, params.userId);
  return createNotification({
    ...params.payload,
    userId: params.userId,
    idempotencyKey: key,
    ttlSeconds: params.ttlSeconds ?? 60 * 60,
  });
}

export const listNotifications = async (params: {
  userId: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: NotificationRecord[]; nextCursor: string | null }> => {
  const limit = Math.min(params.limit || 20, 50);

  const cursorDate = params.cursor ? new Date(params.cursor) : null;
  const hasCursor = cursorDate && !Number.isNaN(cursorDate.getTime());

  const where = hasCursor
    ? and(eq(notifications.userId, params.userId), lt(notifications.createdAt, cursorDate))
    : eq(notifications.userId, params.userId);

  const items = await db.query.notifications.findMany({
    where,
    orderBy: [desc(notifications.createdAt)],
    limit: limit + 1,
  });

  const hasNext = items.length > limit;
  const trimmed = hasNext ? items.slice(0, limit) : items;
  const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.createdAt?.toISOString() ?? null : null;

  return { items: trimmed, nextCursor };
};

export const markNotificationsRead = async (params: {
  userId: string;
  ids: string[];
}) => {
  if (!params.ids.length) return;
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, params.userId), inArray(notifications.id, params.ids)));
};

export const markAllNotificationsRead = async (userId: string) => {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(notifications.userId, userId));
};

export const getUnreadCount = async (userId: string) => {
  const [result] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  return result?.count ?? 0;
};

