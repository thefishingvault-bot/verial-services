import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { notifications } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { notificationIds } = await req.json();

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return new NextResponse('Missing notificationIds', { status: 400 });
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, notificationIds)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_NOTIFICATIONS_MARK_READ]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
import { db } from "@/lib/db";
import { notifications } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { notificationIds } = await req.json(); // Expects an array of IDs
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return new NextResponse("Missing notificationIds", { status: 400 });
    }

    // Update notifications, but only if they belong to this user
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, userId), // Security check
          inArray(notifications.id, notificationIds)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_NOTIFICATIONS_MARK_READ]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

