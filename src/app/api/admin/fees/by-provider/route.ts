import { NextResponse } from 'next/server';
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
    const year = parsedQuery.data.year ?? new Date().getUTCFullYear();
    const format = parsedQuery.data.format;

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
