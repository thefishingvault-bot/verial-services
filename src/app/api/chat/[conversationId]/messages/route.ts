import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const params = await context.params;
    const conversationId = params.conversationId;

    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        or(eq(conversations.user1Id, userId), eq(conversations.user2Id, userId)),
      ),
    });

    if (!conversation) {
      return new NextResponse("Conversation not found or access denied", { status: 404 });
    }

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)],
      with: {
        sender: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return NextResponse.json(chatMessages);
  } catch (error) {
    console.error("[API_CHAT_MESSAGES]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
