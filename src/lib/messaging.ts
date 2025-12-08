import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, or, sql, lt, lte } from "drizzle-orm";

import { bookings, messageThreads, messages, providers, services, users } from "@/db/schema";
import { db } from "@/lib/db";

const ALLOWED_BOOKING_STATUSES = ["pending", "accepted", "paid", "completed", "disputed", "refunded"] as const;
const COMPLETED_WINDOW_DAYS = 90;

const sanitizeContent = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/<[^>]*>/g, "").slice(0, 2000);
};

function bookingWindowClosed(status: string, updatedAt?: Date | null, scheduledAt?: Date | null, createdAt?: Date | null) {
  if (status !== "completed") return false;
  const reference = updatedAt ?? scheduledAt ?? createdAt ?? new Date();
  const cutoff = new Date(Date.now() - COMPLETED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return reference < cutoff;
}

async function threadMessageCount(bookingId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(messages)
    .where(eq(messages.bookingId, bookingId));
  return Number(count ?? 0);
}

export async function ensureBookingRelationship(params: { currentUserId: string; providerId: string }) {
  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, params.providerId),
    columns: { userId: true, id: true },
  });

  if (!provider) throw new Error("Provider not found");

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.providerId, params.providerId), eq(bookings.userId, params.currentUserId)),
    columns: { id: true },
  });

  if (!booking) throw new Error("No booking found for participants");

  return {
    bookingId: booking.id,
    providerUserId: provider.userId,
    customerUserId: params.currentUserId,
    counterpartUserId: provider.userId,
  } as const;
}

export async function canMessage(userId: string, bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: { id: true, status: true, userId: true, providerId: true, scheduledDate: true, createdAt: true, updatedAt: true },
    with: {
      provider: { columns: { userId: true, isSuspended: true, id: true } },
    },
  });

  if (!booking || !booking.provider) return { ok: false, reason: "Booking not found" } as const;
  const isParticipant = booking.userId === userId || booking.provider.userId === userId;
  if (!isParticipant) return { ok: false, reason: "Unauthorized" } as const;

  if (!ALLOWED_BOOKING_STATUSES.includes(booking.status as (typeof ALLOWED_BOOKING_STATUSES)[number])) {
    return { ok: false, reason: "Messaging unavailable for this booking" } as const;
  }

  if (booking.provider.isSuspended) {
    return { ok: false, reason: "Provider suspended" } as const;
  }

  if (bookingWindowClosed(booking.status, booking.updatedAt, booking.scheduledDate, booking.createdAt)) {
    return { ok: false, reason: "Messaging window closed" } as const;
  }

  if (booking.status === "canceled_customer" || booking.status === "canceled_provider") {
    const count = await threadMessageCount(booking.id);
    if (count === 0) return { ok: false, reason: "Booking canceled before messaging" } as const;
  }

  return {
    ok: true,
    booking,
    counterpartUserId: booking.userId === userId ? booking.provider.userId : booking.userId,
  } as const;
}

async function ensureThread(bookingId: string) {
  const existing = await db.query.messageThreads.findFirst({ where: eq(messageThreads.bookingId, bookingId) });
  if (existing) return existing;

  const now = new Date();
  const id = `mthread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(messageThreads).values({ id, bookingId, lastMessageAt: now, createdAt: now, updatedAt: now, unreadCount: 0 });
  return { id, bookingId, lastMessageAt: now, createdAt: now, updatedAt: now, unreadCount: 0 } satisfies typeof messageThreads.$inferSelect;
}

async function refreshThreadUnreadCount(bookingId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(messages)
    .where(and(eq(messages.bookingId, bookingId), isNull(messages.readAt)));

  await db
    .update(messageThreads)
    .set({ unreadCount: Number(count ?? 0), updatedAt: new Date() })
    .where(eq(messageThreads.bookingId, bookingId));
}

export async function listUserThreads(userId: string) {
  const userProviders = await db.query.providers.findMany({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });
  const providerIds = userProviders.map((p) => p.id);

  const bookingWhere = providerIds.length
    ? or(eq(bookings.userId, userId), inArray(bookings.providerId, providerIds))
    : eq(bookings.userId, userId);

  const userBookings = await db.query.bookings.findMany({
    where: bookingWhere,
    columns: { id: true, status: true, userId: true, providerId: true, scheduledDate: true, createdAt: true, updatedAt: true },
    with: {
      service: { columns: { title: true, id: true } },
      provider: {
        columns: { userId: true, businessName: true, id: true },
        with: { user: { columns: { firstName: true, lastName: true, avatarUrl: true, id: true } } },
      },
      user: { columns: { firstName: true, lastName: true, id: true, avatarUrl: true } },
    },
  });

  if (!userBookings.length) return [] as const;

  const bookingIds = userBookings.map((b) => b.id);
  const threads = await db.query.messageThreads.findMany({
    where: inArray(messageThreads.bookingId, bookingIds),
  });
  const threadMap = new Map(threads.map((t) => [t.bookingId, t]));

  const lastMessages = await db
    .select({ bookingId: messages.bookingId, content: messages.content, senderId: messages.senderId, createdAt: messages.createdAt })
    .from(messages)
    .where(inArray(messages.bookingId, bookingIds))
    .orderBy(desc(messages.createdAt));

  const lastByBooking = new Map<string, { content: string; senderId: string; createdAt: Date }>();
  for (const msg of lastMessages) {
    if (!lastByBooking.has(msg.bookingId)) {
      lastByBooking.set(msg.bookingId, { content: msg.content, senderId: msg.senderId, createdAt: msg.createdAt as Date });
    }
  }

  const unreadRows = await db
    .select({ bookingId: messages.bookingId, count: sql<number>`cast(count(*) as int)` })
    .from(messages)
    .where(and(inArray(messages.bookingId, bookingIds), isNull(messages.readAt), ne(messages.senderId, userId)))
    .groupBy(messages.bookingId);
  const unreadMap = new Map<string, number>();
  unreadRows.forEach((row) => unreadMap.set(row.bookingId, Number(row.count)));

  return userBookings.map((booking) => {
    const thread = threadMap.get(booking.id);
    const last = lastByBooking.get(booking.id);
    const counterpartUserId = booking.userId === userId ? booking.provider?.userId : booking.userId;
    const counterpartUser = booking.userId === userId ? booking.provider?.user : booking.user;
    const name = `${counterpartUser?.firstName ?? ""} ${counterpartUser?.lastName ?? ""}`.trim() || "User";
    return {
      bookingId: booking.id,
      threadId: thread?.id ?? null,
      serviceTitle: booking.service?.title ?? "Service",
      counterpart: {
        id: counterpartUserId ?? "",
        name,
        avatarUrl: counterpartUser?.avatarUrl ?? null,
      },
      lastMessage: last?.content ?? null,
      lastMessageAt: last?.createdAt ?? thread?.lastMessageAt ?? booking.createdAt,
      unreadCount: unreadMap.get(booking.id) ?? thread?.unreadCount ?? 0,
      status: booking.status,
    };
  });
}

export async function listThreadMessages(userId: string, bookingId: string, opts?: { limit?: number; cursor?: string }) {
  const allowed = await canMessage(userId, bookingId);
  if (!allowed.ok) throw new Error(allowed.reason);

  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  let cursorDate: Date | null = null;

  if (opts?.cursor) {
    const pivot = await db.query.messages.findFirst({
      where: eq(messages.serverMessageId, opts.cursor),
      columns: { createdAt: true },
    });
    cursorDate = pivot?.createdAt ?? null;
  }

  const whereClauses = [eq(messages.bookingId, bookingId)] as any[];
  if (cursorDate) {
    whereClauses.push(lt(messages.createdAt, cursorDate));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...whereClauses))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const ordered = [...page].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  const nextCursor = hasMore ? page[page.length - 1]?.serverMessageId ?? null : null;

  await markThreadRead(userId, bookingId);

  return { messages: ordered, nextCursor };
}

export async function sendBookingMessage(params: {
  bookingId: string;
  senderId: string;
  content: string;
  tempId?: string | null;
  attachments?: Array<{ type: "image"; url: string; name?: string; size?: number }> | null;
}) {
  const cleaned = sanitizeContent(params.content);
  if (!cleaned) throw new Error("Message cannot be empty");

  const allowed = await canMessage(params.senderId, params.bookingId);
  if (!allowed.ok || !allowed.booking) throw new Error(allowed.reason);
  const { counterpartUserId } = allowed;

  const thread = await ensureThread(params.bookingId);
  const now = new Date();
  const serverMessageId = crypto.randomUUID();
  const legacyId = `msg_${serverMessageId}`;
  const attachments = (params.attachments ?? []).filter((a) => a.type === "image" && a.url);

  const messageRecord = {
    serverMessageId,
    id: legacyId,
    bookingId: params.bookingId,
    threadId: thread.id,
    senderId: params.senderId,
    recipientId: counterpartUserId,
    content: cleaned,
    isSystem: false,
    attachments: attachments.length ? attachments : null,
    clientTempId: params.tempId ?? null,
    deliveredAt: now,
    seenAt: null as Date | null,
    readAt: null as Date | null,
    deletedAt: null as Date | null,
    createdAt: now,
  } satisfies typeof messages.$inferInsert;

  await db.insert(messages).values(messageRecord);
  await db
    .update(messageThreads)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(messageThreads.id, thread.id));

  await refreshThreadUnreadCount(params.bookingId);

  return messageRecord;
}

export async function markThreadRead(userId: string, bookingId: string, lastMessageId?: string | null) {
  const now = new Date();
  const whereClauses = [eq(messages.bookingId, bookingId), isNull(messages.readAt), eq(messages.recipientId, userId)] as any[];

  if (lastMessageId) {
    const pivot = await db.query.messages.findFirst({ where: eq(messages.serverMessageId, lastMessageId), columns: { createdAt: true } });
    if (pivot?.createdAt) {
      whereClauses.push(lte(messages.createdAt, pivot.createdAt));
    }
  }

  await db
    .update(messages)
    .set({ readAt: now, seenAt: now })
    .where(and(...whereClauses));

  await refreshThreadUnreadCount(bookingId);
}

export const __testables = { sanitizeContent, bookingWindowClosed, ensureThread, canMessage };
