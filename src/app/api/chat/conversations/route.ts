import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { conversations, messages, users } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const userConversations = await db.query.conversations.findMany({
      where: or(eq(conversations.user1Id, userId), eq(conversations.user2Id, userId)),
      with: {
        user1: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        user2: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        messages: {
          orderBy: [desc(messages.createdAt)],
          limit: 1,
        },
      },
      orderBy: [desc(conversations.lastMessageAt)],
    });

    const formatted = userConversations.map((c) => {
      const otherUser = c.user1Id === userId ? c.user2 : c.user1;
      const lastMsg = c.messages[0];

      return {
        id: c.id,
        otherUser: {
          id: otherUser.id,
          name: `${otherUser.firstName || "User"} ${otherUser.lastName || ""}`.trim(),
          avatarUrl: otherUser.avatarUrl,
        },
        lastMessage: lastMsg ? lastMsg.content : "No messages yet",
        lastMessageAt: c.lastMessageAt,
        unread: false,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("[API_CHAT_CONVERSATIONS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
