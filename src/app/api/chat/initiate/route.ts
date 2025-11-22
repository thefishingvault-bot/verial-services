import { db } from '@/lib/db';
import { conversations } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, and, or } from 'drizzle-orm';

export const runtime = 'nodejs';

const generateConvId = () => `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { recipientId } = await req.json();
    if (!recipientId) return new NextResponse('Missing recipientId', { status: 400 });

    if (userId === recipientId) {
      return new NextResponse('Cannot chat with yourself', { status: 400 });
    }

    const existing = await db.query.conversations.findFirst({
      where: or(
        and(eq(conversations.user1Id, userId), eq(conversations.user2Id, recipientId)),
        and(eq(conversations.user1Id, recipientId), eq(conversations.user2Id, userId))
      ),
    });

    if (existing) {
      return NextResponse.json({ conversationId: existing.id });
    }

    const newId = generateConvId();
    await db.insert(conversations).values({
      id: newId,
      user1Id: userId,
      user2Id: recipientId,
      lastMessageAt: new Date(),
    });

    return NextResponse.json({ conversationId: newId });
  } catch (error) {
    console.error('[API_CHAT_INITIATE]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
