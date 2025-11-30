import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { trustIncidents, providers, users } from '@/db/schema';
import { eq, desc, gte, sql, and } from 'drizzle-orm';

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

    if (!user[0] || user[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '30d';
    const severity = searchParams.get('severity') || 'all';

    // Calculate date filter
    const now = new Date();
    const startDate: Date = (() => {
      switch (timeframe) {
        case '7d':
          return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '30d':
          return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case '90d':
          return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        default:
          return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
    })();

    // Build query conditions
    const conditions = [gte(trustIncidents.createdAt, startDate)];

    if (severity !== 'all') {
      conditions.push(sql`${trustIncidents.severity} = ${severity}`);
    }

    // Get trust incidents with provider info
    const anomalies = await db
      .select({
        id: trustIncidents.id,
        type: trustIncidents.incidentType,
        severity: trustIncidents.severity,
        description: trustIncidents.description,
        status: sql<string>`case when resolved = true then 'resolved' else 'open' end`,
        createdAt: trustIncidents.createdAt,
        providerId: trustIncidents.providerId,
        providerName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        providerHandle: providers.handle,
      })
      .from(trustIncidents)
      .leftJoin(providers, eq(trustIncidents.providerId, providers.id))
      .leftJoin(users, eq(providers.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(trustIncidents.createdAt));

    // Get summary statistics
    const stats = await db
      .select({
        totalIncidents: sql<number>`count(*)`,
        highSeverity: sql<number>`count(case when severity = 'high' then 1 end)`,
        mediumSeverity: sql<number>`count(case when severity = 'medium' then 1 end)`,
        lowSeverity: sql<number>`count(case when severity = 'low' then 1 end)`,
        openIncidents: sql<number>`count(case when resolved = false then 1 end)`,
        resolvedIncidents: sql<number>`count(case when resolved = true then 1 end)`,
      })
      .from(trustIncidents)
      .where(gte(trustIncidents.createdAt, startDate));

    // Get incidents by type
    const incidentsByType = await db
      .select({
        type: trustIncidents.incidentType,
        count: sql<number>`count(*)`,
      })
      .from(trustIncidents)
      .where(gte(trustIncidents.createdAt, startDate))
      .groupBy(trustIncidents.incidentType);

    // Get top providers with incidents
    const topProviders = await db
      .select({
        providerId: trustIncidents.providerId,
        providerName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        providerHandle: providers.handle,
        incidentCount: sql<number>`count(*)`,
      })
      .from(trustIncidents)
      .leftJoin(providers, eq(trustIncidents.providerId, providers.id))
      .leftJoin(users, eq(providers.userId, users.id))
      .where(gte(trustIncidents.createdAt, startDate))
      .groupBy(trustIncidents.providerId, users.firstName, users.lastName, providers.handle)
      .orderBy(desc(sql<number>`count(*)`))
      .limit(10);

    return NextResponse.json({
      anomalies,
      stats: stats[0],
      incidentsByType,
      topProviders,
      timeframe,
      severity,
    });
  } catch (error) {
    console.error('Error fetching trust anomalies:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}