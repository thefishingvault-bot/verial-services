import { db } from '@/lib/db';
import { messages, conversations } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and, or, asc } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const params = await context.params;
    const conversationId = params.conversationId;

    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        or(eq(conversations.user1Id, userId), eq(conversations.user2Id, userId))
      ),
      with: {
        user1: {
          columns: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true },
          with: { provider: { columns: { businessName: true, handle: true } } },
        },
        user2: {
          columns: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true },
          with: { provider: { columns: { businessName: true, handle: true } } },
        },
        messages: {
          orderBy: [asc(messages.createdAt)],
          with: {
            sender: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } }
          }
        }
      }
    });

    if (!conversation) {
      return new NextResponse('Conversation not found', { status: 404 });
    }

    const otherUser = conversation.user1Id === userId ? conversation.user2 : conversation.user1;
    let name = (otherUser.firstName && otherUser.lastName)
      ? `${otherUser.firstName} ${otherUser.lastName}`
      : (otherUser.firstName || otherUser.email);

    if (otherUser.provider?.businessName) {
      name = otherUser.provider.businessName;
    }

    return NextResponse.json({
      messages: conversation.messages,
      otherUser: {
        id: otherUser.id,
        name,
        avatarUrl: otherUser.avatarUrl,
        handle: otherUser.provider?.handle,
      }
    });

  } catch (error) {
    console.error('[API_CHAT_MESSAGES]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
