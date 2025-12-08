import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { markAllNotificationsRead } from '@/lib/notifications';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    await markAllNotificationsRead(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_NOTIFICATIONS_MARK_ALL]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
