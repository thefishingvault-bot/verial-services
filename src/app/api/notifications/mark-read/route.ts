import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { markNotificationsRead } from '@/lib/notifications';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { notificationIds } = await req.json();
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return new NextResponse('Missing notificationIds', { status: 400 });
    }

    await markNotificationsRead({ userId, ids: notificationIds });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_NOTIFICATIONS_MARK_READ]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

