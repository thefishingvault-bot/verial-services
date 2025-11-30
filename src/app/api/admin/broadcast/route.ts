import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, notifications } from '@/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]?.role?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get broadcast messages (notifications created by admin)

    // Get recent broadcast messages and their delivery stats
    const broadcastMessages = await db
      .select({
        id: notifications.id,
        message: notifications.message,
        href: notifications.href,
        createdAt: notifications.createdAt,
        createdBy: notifications.userId, // This would be the admin who sent it
        totalSent: sql<number>`count(*) over (partition by notifications.message, notifications.created_at)`, // Simplified - would need proper broadcast tracking
        totalRead: sql<number>`count(case when notifications.is_read then 1 end) over (partition by notifications.message, notifications.created_at)`,
      })
      .from(notifications)
      .where(sql`notifications.user_id != ${userId}`) // Exclude admin's own notifications
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // Get overall broadcast statistics
    const broadcastStats = await db
      .select({
        totalBroadcasts: sql<number>`count(distinct concat(notifications.message, notifications.created_at::text))`,
        totalNotificationsSent: sql<number>`count(*)`,
        totalRead: sql<number>`count(case when notifications.is_read then 1 end)`,
        avgReadRate: sql<number>`avg(case when notifications.is_read then 1.0 else 0.0 end)`,
      })
      .from(notifications)
      .where(sql`notifications.user_id != ${userId}`); // Exclude admin notifications

    // Get broadcast performance over time (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const broadcastTrends = await db
      .select({
        date: sql<string>`date(notifications.created_at)`,
        messagesSent: sql<number>`count(*)`,
        messagesRead: sql<number>`count(case when notifications.is_read then 1 end)`,
        readRate: sql<number>`avg(case when notifications.is_read then 1.0 else 0.0 end)`,
      })
      .from(notifications)
      .where(and(
        sql`notifications.user_id != ${userId}`,
        gte(notifications.createdAt, thirtyDaysAgo)
      ))
      .groupBy(sql`date(notifications.created_at)`)
      .orderBy(sql`date(notifications.created_at)`);

    // Get target audience options (user roles and segments)
    const userSegments = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .groupBy(users.role);

    return NextResponse.json({
      broadcasts: broadcastMessages.slice(0, 10), // Return recent broadcasts
      stats: {
        totalBroadcasts: broadcastStats[0]?.totalBroadcasts || 0,
        totalNotificationsSent: broadcastStats[0]?.totalNotificationsSent || 0,
        totalRead: broadcastStats[0]?.totalRead || 0,
        avgReadRate: (broadcastStats[0]?.avgReadRate || 0) * 100,
      },
      trends: broadcastTrends,
      userSegments,
      pagination: {
        page,
        limit,
        total: broadcastMessages.length,
      },
    });
  } catch (error) {
    console.error('Error fetching broadcast messaging data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]?.role?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { message, href, targetRoles, targetUsers } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Build target user query
    let targetUserIds: string[] = [];

    if (targetUsers && targetUsers.length > 0) {
      // Specific users
      targetUserIds = targetUsers;
    } else if (targetRoles && targetRoles.length > 0) {
      // Users by role
      const roleUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`${users.role} = any(${targetRoles})`);

      targetUserIds = roleUsers.map(u => u.id);
    } else {
      // All users except admins
      const allUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`not (${users.role}::text like '%admin%')`);

      targetUserIds = allUsers.map(u => u.id);
    }

    // Create notifications for all target users
    const notificationsToInsert = targetUserIds.map(targetUserId => ({
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: targetUserId,
      message: message.trim(),
      href: href || '/dashboard',
    }));

    // Insert notifications in batches to avoid overwhelming the database
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < notificationsToInsert.length; i += batchSize) {
      const batch = notificationsToInsert.slice(i, i + batchSize);
      await db.insert(notifications).values(batch);
      insertedCount += batch.length;
    }

    return NextResponse.json({
      success: true,
      message: `Broadcast sent to ${insertedCount} users`,
      recipients: insertedCount,
      broadcast: {
        message: message.trim(),
        href: href || '/dashboard',
        targetRoles: targetRoles || [],
        targetUsers: targetUsers || [],
        sentBy: userId,
        sentAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error sending broadcast message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}