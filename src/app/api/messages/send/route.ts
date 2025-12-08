import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { messageThreads } from "@/db/schema";
import { db } from "@/lib/db";
import { sendBookingMessage } from "@/lib/messaging";
import { pusherServer } from "@/lib/pusher";
import { MessageSendSchema } from "@/lib/validation/messages";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { messageIdempotencyKey, withIdempotency } from "@/lib/idempotency";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const parsed = MessageSendSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });

    const rate = await enforceRateLimit(req, {
      userId,
      resource: "messages:send",
      limit: 10,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const idemKey = messageIdempotencyKey(parsed.data.threadId, parsed.data.tempId ?? null, parsed.data);

    const message = await withIdempotency(idemKey, 60 * 60, async () => {
      const created = await sendBookingMessage({
        bookingId: parsed.data.threadId,
        senderId: userId,
        content: parsed.data.content,
        tempId: parsed.data.tempId,
        attachments: parsed.data.attachments,
      });

      if (pusherServer) {
        await pusherServer.trigger(`private-thread-${parsed.data.threadId}`, "message:new", created);
        const threadRow = await db.query.messageThreads.findFirst({
          where: eq(messageThreads.bookingId, parsed.data.threadId),
          columns: { unreadCount: true },
        });
        await pusherServer.trigger(`private-thread-${parsed.data.threadId}`, "thread:unread", {
          threadId: parsed.data.threadId,
          unreadCount: threadRow?.unreadCount ?? 0,
        });
      }

      return created;
    });

    return NextResponse.json(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("booking") || message.includes("Forbidden") || message.includes("empty") ? 403 : 500;
    console.error("[API_MESSAGES_SEND]", error);
    return new NextResponse(message, { status });
  }
}
