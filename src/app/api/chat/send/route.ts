import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, or, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { bookings, conversations, messages, providers, users } from "@/db/schema";
import { pusherServer } from "@/lib/pusher";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
const generateConvId = () => `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 20;
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimiter.get(userId)?.filter((t) => now - t < RATE_LIMIT_WINDOW_MS) ?? [];
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimiter.set(userId, timestamps);
  return true;
}

async function ensureBookingLink(userId: string, counterpartId: string) {
  // Determine which party is the provider
  const providerForSender = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });

  const providerForRecipient = await db.query.providers.findFirst({
    where: eq(providers.userId, counterpartId),
    columns: { id: true },
  });

  let providerId: string | null = null;
  let customerId: string | null = null;

  if (providerForSender) {
    providerId = providerForSender.id;
    customerId = counterpartId;
  } else if (providerForRecipient) {
    providerId = providerForRecipient.id;
    customerId = userId;
  }

  if (!providerId || !customerId) {
    throw new Error("Messaging is only allowed between providers and their customers.");
  }

  const existingBooking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.providerId, providerId),
      eq(bookings.userId, customerId),
      inArray(bookings.status, ["pending", "accepted", "paid", "completed", "disputed"]),
    ),
    columns: { id: true },
  });

  if (!existingBooking) {
    throw new Error("A booking must exist between you and this user to send messages.");
  }

  return existingBooking.id;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    if (!checkRateLimit(userId)) {
      return new NextResponse("Rate limit exceeded", { status: 429 });
    }

    const { recipientId, content, conversationId } = await req.json();

    if (!content || (!recipientId && !conversationId)) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    let activeConversationId: string | null = conversationId ?? null;
    let resolvedRecipientId = recipientId ?? null;

    if (!activeConversationId) {
      const existing = await db.query.conversations.findFirst({
        where: or(
          and(eq(conversations.user1Id, userId), eq(conversations.user2Id, recipientId)),
          and(eq(conversations.user1Id, recipientId), eq(conversations.user2Id, userId)),
        ),
      });

      if (existing) {
        activeConversationId = existing.id;
        resolvedRecipientId = existing.user1Id === userId ? existing.user2Id : existing.user1Id;
      } else {
        const bookingId = await ensureBookingLink(userId, recipientId);
        activeConversationId = generateConvId();
        await db.insert(conversations).values({
          id: activeConversationId,
          user1Id: userId,
          user2Id: recipientId,
          lastMessageAt: new Date(),
        });
        resolvedRecipientId = recipientId;
        console.log(`[CHAT] conversation created for booking ${bookingId}`);
      }
    }

    if (!activeConversationId) {
      return new NextResponse("Failed to resolve conversation", { status: 500 });
    }

    // Ensure the conversation still maps to a booking
    if (resolvedRecipientId) {
      try {
        await ensureBookingLink(userId, resolvedRecipientId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unauthorized";
        return new NextResponse(message, { status: 403 });
      }
    }

    const newMessage = {
      id: generateId(),
      conversationId: activeConversationId,
      senderId: userId,
      content,
      isRead: false,
      createdAt: new Date(),
    };

    await db.insert(messages).values(newMessage);

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, activeConversationId));

    if (pusherServer) {
      await pusherServer.trigger(`chat-${activeConversationId}`, "new-message", newMessage);
    }

    // Notify recipient if provided
    if (resolvedRecipientId) {
      await createNotification({
        userId: resolvedRecipientId,
        message: "New message",
        href: `/dashboard/messages/${activeConversationId}`,
      });

      try {
        const recipient = await db.query.users.findFirst({
          where: eq(users.id, resolvedRecipientId),
          columns: { email: true },
        });

        if (recipient?.email) {
          await sendEmail({
            to: recipient.email,
            subject: "New Message on Verial",
            html: `<p>You have a new message.</p><a href='${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/messages/${activeConversationId}'>View Message</a>`,
          });
        }
      } catch (e) {
        console.error("Failed to send email notification", e);
      }
    }

    return NextResponse.json(newMessage);
  } catch (error) {
    console.error("[API_CHAT_SEND]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
