import { db } from '@/lib/db';
import { notifications } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

      const userNotifications = await db.query.notifications.findMany({
        where: eq(notifications.userId, userId),
        orderBy: [desc(notifications.createdAt)],
        limit: 20,
      });

    return NextResponse.json(userNotifications);
  } catch (error) {
    console.error('[API_NOTIFICATIONS_LIST]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

