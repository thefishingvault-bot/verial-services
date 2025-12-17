import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { listNotifications } from '@/lib/notifications';
import { enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const rate = await enforceRateLimit(request, {
      userId,
      resource: 'notifications:list',
      limit: 60,
      windowSeconds: 60,
    });

    if (!rate.success) {
      return rateLimitResponse(rate.retryAfter);
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const cursor = url.searchParams.get('cursor') || undefined;

    const parsedLimit = limit ? Number(limit) : undefined;

    const result = await listNotifications({ userId, limit: parsedLimit, cursor });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API_NOTIFICATIONS_LIST]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

