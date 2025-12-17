import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { markAllNotificationsRead } from '@/lib/notifications';
import { enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const rate = await enforceRateLimit(req, {
      userId,
      resource: 'notifications:mark-all',
      limit: 10,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    await markAllNotificationsRead(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_NOTIFICATIONS_MARK_ALL]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
