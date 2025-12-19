import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminAuditLogs } from '@/db/schema';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const resource = searchParams.get('resource');
    const userFilter = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const whereParts = [] as Array<ReturnType<typeof eq> | ReturnType<typeof gte> | ReturnType<typeof lte>>;

    if (action && action !== 'all') whereParts.push(eq(adminAuditLogs.action, action));
    if (resource && resource !== 'all') whereParts.push(eq(adminAuditLogs.resource, resource));
    if (userFilter && userFilter !== 'all') whereParts.push(eq(adminAuditLogs.userId, userFilter));

    if (startDate) {
      const start = new Date(startDate);
      if (!Number.isNaN(start.getTime())) whereParts.push(gte(adminAuditLogs.createdAt, start));
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime())) whereParts.push(lte(adminAuditLogs.createdAt, end));
    }

    const where = whereParts.length ? and(...whereParts) : undefined;

    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Math.min(200, Math.max(1, Number.isFinite(limit) ? limit : 50));
    const offset = (safePage - 1) * safeLimit;

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [rows, totalRes, totalEventsRes, eventsLast24hRes, eventsLast7dRes, uniqueUsersRes, actionBreakdownRes] =
      await Promise.all([
        db
          .select({
            id: adminAuditLogs.id,
            userId: adminAuditLogs.userId,
            action: adminAuditLogs.action,
            resource: adminAuditLogs.resource,
            resourceId: adminAuditLogs.resourceId,
            details: adminAuditLogs.details,
            ipAddress: adminAuditLogs.ipAddress,
            userAgent: adminAuditLogs.userAgent,
            timestamp: adminAuditLogs.createdAt,
          })
          .from(adminAuditLogs)
          .where(where)
          .orderBy(desc(adminAuditLogs.createdAt))
          .limit(safeLimit)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(adminAuditLogs).where(where),
        db.select({ count: sql<number>`COUNT(*)` }).from(adminAuditLogs),
        db.select({ count: sql<number>`COUNT(*)` }).from(adminAuditLogs).where(gte(adminAuditLogs.createdAt, last24h)),
        db.select({ count: sql<number>`COUNT(*)` }).from(adminAuditLogs).where(gte(adminAuditLogs.createdAt, last7d)),
        db
          .select({ userId: adminAuditLogs.userId })
          .from(adminAuditLogs)
          .groupBy(adminAuditLogs.userId)
          .orderBy(adminAuditLogs.userId)
          .limit(500),
        db
          .select({ action: adminAuditLogs.action, count: sql<number>`COUNT(*)` })
          .from(adminAuditLogs)
          .groupBy(adminAuditLogs.action),
      ]);

    const total = Number(totalRes[0]?.count ?? 0);
    const uniqueUsers = uniqueUsersRes.map((u) => u.userId);
    const actionBreakdown = actionBreakdownRes.reduce(
      (acc, row) => {
        acc[row.action] = Number(row.count ?? 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    return NextResponse.json({
      logs: rows.map((r) => ({
        ...r,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      })),
      stats: {
        totalEvents: Number(totalEventsRes[0]?.count ?? 0),
        eventsLast24h: Number(eventsLast24hRes[0]?.count ?? 0),
        eventsLast7d: Number(eventsLast7dRes[0]?.count ?? 0),
        uniqueUsers: uniqueUsers.length,
      },
      actionBreakdown,
      uniqueUsers,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}