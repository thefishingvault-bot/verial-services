import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { getUnreadCount } from '@/lib/notifications';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const count = await getUnreadCount(userId);

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[API_NOTIFICATIONS_UNREAD_COUNT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
