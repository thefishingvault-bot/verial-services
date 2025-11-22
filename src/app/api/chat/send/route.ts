import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { conversations, messages, users } from "@/db/schema";
import { pusherServer } from "@/lib/pusher";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
const generateConvId = () => `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { recipientId, content, conversationId } = await req.json();

    if (!content || (!recipientId && !conversationId)) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    let activeConversationId: string | null = conversationId ?? null;

    if (!activeConversationId) {
      const existing = await db.query.conversations.findFirst({
        where: or(
          and(eq(conversations.user1Id, userId), eq(conversations.user2Id, recipientId)),
          and(eq(conversations.user1Id, recipientId), eq(conversations.user2Id, userId)),
        ),
      });

      if (existing) {
        activeConversationId = existing.id;
      } else {
        activeConversationId = generateConvId();
        await db.insert(conversations).values({
          id: activeConversationId,
          user1Id: userId,
          user2Id: recipientId,
          lastMessageAt: new Date(),
        });
      }
    }

    if (!activeConversationId) {
      return new NextResponse("Failed to resolve conversation", { status: 500 });
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
    if (recipientId) {
      await createNotification({
        userId: recipientId,
        message: "New message",
        href: `/dashboard/messages/${activeConversationId}`,
      });

      try {
        const recipient = await db.query.users.findFirst({
          where: eq(users.id, recipientId),
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
