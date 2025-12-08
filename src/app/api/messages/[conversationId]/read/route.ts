import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { messageThreads } from "@/db/schema";
import { db } from "@/lib/db";
import { markThreadRead } from "@/lib/messaging";
import { pusherServer } from "@/lib/pusher";
import { MarkReadSchema } from "@/lib/validation/messages";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: { conversationId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const body = (await req.json().catch(() => ({}))) ?? {};
    const parsed = MarkReadSchema.safeParse({ ...body, threadId: context.params.conversationId });
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });

    await markThreadRead(userId, parsed.data.threadId, parsed.data.lastMessageId);

    if (pusherServer) {
      if (parsed.data.lastMessageId) {
        await pusherServer.trigger(`private-thread-${parsed.data.threadId}`, "message:seen", {
          serverMessageId: parsed.data.lastMessageId,
        });
      }
      const threadRow = await db.query.messageThreads.findFirst({
        where: eq(messageThreads.bookingId, parsed.data.threadId),
        columns: { unreadCount: true },
      });
      await pusherServer.trigger(`private-thread-${parsed.data.threadId}`, "thread:unread", {
        threadId: parsed.data.threadId,
        unreadCount: threadRow?.unreadCount ?? 0,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("Forbidden") ? 403 : 500;
    console.error("[API_MESSAGES_READ]", error);
    return new NextResponse(message, { status });
  }
}
