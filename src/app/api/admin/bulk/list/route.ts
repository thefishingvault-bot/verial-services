import { db } from '@/lib/db';
import { providers, users, bookings, services, bookingStatusEnum } from '@/db/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'providers';
    const status = searchParams.get('status') || 'all';
    const region = searchParams.get('region') || 'all';
    const q = searchParams.get('q') || '';

    if (type === 'providers') {
      // Build where conditions for providers
      const whereConditions = [];

      if (status !== 'all') {
        whereConditions.push(eq(providers.status, status as 'pending' | 'approved' | 'rejected'));
      }

      if (region !== 'all') {
        whereConditions.push(eq(services.region, region));
      }

      if (q) {
        whereConditions.push(
          or(
            ilike(providers.businessName, `%${q}%`),
            ilike(providers.handle, `%${q}%`),
            ilike(users.email, `%${q}%`)
          )
        );
      }

      const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      const providersData = await db
        .select({
          id: providers.id,
          businessName: providers.businessName,
          handle: providers.handle,
          status: providers.status,
          trustLevel: providers.trustLevel,
          trustScore: providers.trustScore,
          region: sql<string | null>`MIN(${services.region})`,
          createdAt: providers.createdAt,
          userEmail: users.email,
        })
        .from(providers)
        .innerJoin(users, eq(providers.userId, users.id))
        .leftJoin(services, eq(services.providerId, providers.id))
        .where(where)
        .groupBy(
          providers.id,
          providers.businessName,
          providers.handle,
          providers.status,
          providers.trustLevel,
          providers.trustScore,
          providers.createdAt,
          users.email,
        )
        .orderBy(providers.createdAt)
        .limit(100);

      const totalCount = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${providers.id})` })
        .from(providers)
        .innerJoin(users, eq(providers.userId, users.id))
        .leftJoin(services, eq(services.providerId, providers.id))
        .where(where);

      return NextResponse.json({
        items: providersData,
        totalCount: totalCount[0].count,
      });
    } else if (type === 'bookings') {
      // Build where conditions for bookings
      const whereConditions = [];
      const statusFilter = bookingStatusEnum.enumValues.find(
        (value): value is (typeof bookingStatusEnum.enumValues)[number] => value === status,
      );

      if (status !== 'all' && statusFilter) {
        whereConditions.push(eq(bookings.status, statusFilter));
      }

      if (q) {
        whereConditions.push(
          or(
            ilike(services.title, `%${q}%`),
            ilike(providers.businessName, `%${q}%`),
            ilike(users.email, `%${q}%`)
          )
        );
      }

      const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      const bookingsData = await db
        .select({
          id: bookings.id,
          status: bookings.status,
          scheduledDate: bookings.scheduledDate,
          priceAtBooking: bookings.priceAtBooking,
          providerName: providers.businessName,
          customerEmail: users.email,
          serviceTitle: services.title,
          createdAt: bookings.createdAt,
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .innerJoin(providers, eq(bookings.providerId, providers.id))
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .where(where)
        .orderBy(bookings.createdAt)
        .limit(100);

      const totalCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .innerJoin(providers, eq(bookings.providerId, providers.id))
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .where(where);

      return NextResponse.json({
        items: bookingsData,
        totalCount: totalCount[0].count,
      });
    }

    return new NextResponse('Invalid type', { status: 400 });
  } catch (error) {
    console.error('[API_ADMIN_BULK_LIST]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}