import { NextResponse } from 'next/server';
import { getAdminFeesReport } from '@/server/admin/fees';
import { requireAdmin } from '@/lib/admin-auth';
import { FeesReportQuerySchema, invalidResponse, parseQuery } from '@/lib/validation/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  console.log('[API_ADMIN_FEES_REPORT] Request received:', request.url);
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const parsedQuery = parseQuery(FeesReportQuerySchema, request);
    if (!parsedQuery.ok) return invalidResponse(parsedQuery.error);
    const { from: fromParam, to: toParam } = parsedQuery.data;

    const report = await getAdminFeesReport({ from: fromParam, to: toParam });

    return NextResponse.json(report);

  } catch (error) {
    console.error('[API_ADMIN_FEES_REPORT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

