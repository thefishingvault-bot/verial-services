import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { getUnreadCount } from '@/lib/notifications';
import { enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const rate = await enforceRateLimit(req, {
      userId,
      resource: 'notifications:unread-count',
      limit: 120,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const count = await getUnreadCount(userId);

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[API_NOTIFICATIONS_UNREAD_COUNT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
