import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getAdminFeesReport } from '@/server/admin/fees';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  console.log('[API_ADMIN_FEES_REPORT] Request received:', request.url);
  try {
    const user = await currentUser();
    if (!user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    await requireAdmin(user.id);

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    if (!fromParam || !toParam) {
      return new NextResponse('Missing date range parameters', { status: 400 });
    }

    const report = await getAdminFeesReport({ from: fromParam, to: toParam });

    return NextResponse.json(report);

  } catch (error) {
    console.error('[API_ADMIN_FEES_REPORT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

