import { db } from '@/lib/db';
import { providers, users, bookings, services, bookingStatusEnum } from '@/db/schema';
import { eq, and, or, ilike, sql, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { z } from 'zod';

const BulkListQuerySchema = z.object({
  type: z.enum(['providers', 'bookings']).default('providers'),
  status: z.string().trim().optional().default('all'),
  region: z.string().trim().optional().default('all'),
  q: z.string().trim().optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(req.url);

    const parsed = BulkListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query params', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, status, region, q, page, pageSize } = parsed.data;
    const offset = (page - 1) * pageSize;

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
        .limit(pageSize)
        .offset(offset);

      const totalCount = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${providers.id})` })
        .from(providers)
        .innerJoin(users, eq(providers.userId, users.id))
        .leftJoin(services, eq(services.providerId, providers.id))
        .where(where);

      const totalPages = Math.max(1, Math.ceil(totalCount[0].count / pageSize));

      return NextResponse.json({
        items: providersData,
        totalCount: totalCount[0].count,
        page,
        pageSize,
        totalPages,
      });
    } else if (type === 'bookings') {
      // Build where conditions for bookings
      const whereConditions = [];
      const normalizedStatus = status === 'confirmed' ? 'accepted' : status;
      const canceledStatuses: (typeof bookingStatusEnum.enumValues)[number][] = [
        'canceled_customer',
        'canceled_provider',
      ];

      if (normalizedStatus !== 'all') {
        if (normalizedStatus === 'canceled') {
          whereConditions.push(inArray(bookings.status, canceledStatuses));
        } else {
          const statusFilter = bookingStatusEnum.enumValues.find(
            (value): value is (typeof bookingStatusEnum.enumValues)[number] => value === normalizedStatus,
          );

          if (statusFilter) {
            whereConditions.push(eq(bookings.status, statusFilter));
          }
        }
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
          totalAmount: bookings.priceAtBooking,
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
        .limit(pageSize)
        .offset(offset);

      const totalCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .innerJoin(providers, eq(bookings.providerId, providers.id))
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .where(where);

      const totalPages = Math.max(1, Math.ceil(totalCount[0].count / pageSize));

      return NextResponse.json({
        items: bookingsData,
        totalCount: totalCount[0].count,
        page,
        pageSize,
        totalPages,
      });
    }

    return new NextResponse('Invalid type', { status: 400 });
  } catch (error) {
    console.error('[API_ADMIN_BULK_LIST]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}