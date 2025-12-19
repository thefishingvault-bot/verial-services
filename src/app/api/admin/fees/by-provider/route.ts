import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, providers } from '@/db/schema';
import { and, between, desc, eq, inArray, sql } from 'drizzle-orm';
import { getFeesByProvider } from '@/server/admin/fees';
import { requireAdmin } from '@/lib/admin-auth';
import { FeesByProviderQuerySchema, invalidResponse, parseQuery } from '@/lib/validation/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(FeesByProviderQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { year: yearParam, format, from, to, provider } = parsedQuery.data;

    // If a date range is provided, compute from live bookings to keep exports aligned
    // with the selected period even if providerEarnings is unavailable.
    if (from && to) {
      const start = new Date(from);
      const end = new Date(to);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return new NextResponse('Invalid date range', { status: 400 });
      }
      end.setHours(23, 59, 59, 999);

      const feeBps = parseInt(process.env.PLATFORM_FEE_BPS || '1000', 10);
      const gstBps = parseInt(process.env.GST_BPS || '1500', 10);

      const baseConditions = [
        between(bookings.updatedAt, start, end),
        sql`(${bookings.status})::text in ('paid','completed')`,
      ];
      if (provider) {
        baseConditions.push(eq(bookings.providerId, provider));
      }

      const rows = await db
        .select({
          providerId: bookings.providerId,
          providerName: providers.businessName,
          totalGross: sql<number>`coalesce(sum(${bookings.priceAtBooking}), 0)`,
          totalFee: sql<number>`coalesce(sum(ceil(${bookings.priceAtBooking} * ${feeBps} / 10000.0)), 0)`,
          totalGst: sql<number>`coalesce(sum(ceil(ceil(${bookings.priceAtBooking} * ${feeBps} / 10000.0) * ${gstBps} / 10000.0)), 0)`,
        })
        .from(bookings)
        .leftJoin(providers, eq(providers.id, bookings.providerId))
        .where(and(...baseConditions))
        .groupBy(bookings.providerId, providers.businessName)
        .orderBy(desc(sql`coalesce(sum(${bookings.priceAtBooking}), 0)`));

      const normalized = rows
        .filter((r) => r.providerId)
        .map((r) => ({
          providerId: r.providerId as string,
          providerName: r.providerName ?? null,
          totalGross: r.totalGross,
          totalFee: r.totalFee,
          totalNet: Math.max(0, r.totalGross - r.totalFee - r.totalGst),
        }));

      if (format === 'csv') {
        const header = 'providerId,providerName,totalGross,totalFee,totalNet';
        const body = normalized
          .map((r) => [r.providerId, r.providerName ?? '', r.totalGross, r.totalFee, r.totalNet].join(','))
          .join('\n');
        return new NextResponse([header, body].join('\n'), {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="fees-by-provider-${from}-to-${to}.csv"`,
          },
        });
      }

      return NextResponse.json(normalized);
    }

    const year = yearParam ?? new Date().getUTCFullYear();
    const rows = await getFeesByProvider(year);

    if (format === 'csv') {
      const header = 'providerId,providerName,totalGross,totalFee,totalNet';
      const body = rows
        .map((r) => [r.providerId, r.providerName ?? '', r.totalGross, r.totalFee, r.totalNet].join(','))
        .join('\n');
      return new NextResponse([header, body].join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="fees-by-provider-${year}.csv"`,
        },
      });
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error('[API_ADMIN_FEES_BY_PROVIDER]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
