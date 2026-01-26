import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { bookings, users } from "@/db/schema";
import { db } from "@/lib/db";
import { canMessage, listThreadMessages, sendBookingMessage } from "@/lib/messaging";
import { MessageListSchema, MessageSendSchema } from "@/lib/validation/messages";
import { asOne } from "@/lib/relations/normalize";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { conversationId } = await context.params;
    const parsed = MessageListSchema.safeParse({
      threadId: conversationId,
      ...Object.fromEntries(new URL(req.url).searchParams.entries()),
    });
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });

    const { threadId, limit, cursor } = parsed.data;
    const allowed = await canMessage(userId, threadId);
    if (!allowed.ok || !allowed.booking) return new NextResponse(allowed.reason, { status: 403 });

    const { messages: items, nextCursor } = await listThreadMessages(userId, threadId, { limit, cursor });

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, threadId),
      columns: { id: true, userId: true },
      with: {
        provider: { columns: { userId: true }, with: { user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    const provider = asOne(booking?.provider);
    const customerUser = asOne(booking?.user);

    const providerUser = provider?.userId
      ? await db.query.users.findFirst({
          where: eq(users.id, provider.userId),
          columns: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : null;

    const counterpartUser = booking?.userId === userId ? providerUser : customerUser;

    return NextResponse.json({
      messages: items,
      nextCursor,
      counterpart: counterpartUser
        ? {
            id: counterpartUser.id,
            name: `${counterpartUser.firstName ?? ""} ${counterpartUser.lastName ?? ""}`.trim() || "User",
            avatarUrl: counterpartUser.avatarUrl,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Forbidden") || message.includes("Booking") ? 403 : 500;
    console.error("[API_MESSAGES_THREAD_GET]", error);
    return new NextResponse(message, { status });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { conversationId } = await context.params;
    const body = await req.json();
    const parsed = MessageSendSchema.safeParse({ ...body, threadId: conversationId });
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });

    const message = await sendBookingMessage({
      bookingId: parsed.data.threadId,
      senderId: userId,
      content: parsed.data.content,
      tempId: parsed.data.tempId,
      attachments: parsed.data.attachments,
    });

    return NextResponse.json(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("booking") || message.includes("Forbidden") || message.includes("empty") ? 403 : 500;
    console.error("[API_MESSAGES_THREAD_POST]", error);
    return new NextResponse(message, { status });
  }
}
