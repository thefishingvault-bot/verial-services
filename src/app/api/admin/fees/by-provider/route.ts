import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getFeesByProvider } from '@/server/admin/fees';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    await requireAdmin(user.id);

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const format = searchParams.get('format');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

    if (Number.isNaN(year)) {
      return new NextResponse('Invalid year', { status: 400 });
    }

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
