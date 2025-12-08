import { NextResponse } from 'next/server';
import { getFeesSummary } from '@/server/admin/fees';
import { requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

    if (Number.isNaN(year)) {
      return new NextResponse('Invalid year', { status: 400 });
    }

    const data = await getFeesSummary(year);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API_ADMIN_FEES_SUMMARY]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
