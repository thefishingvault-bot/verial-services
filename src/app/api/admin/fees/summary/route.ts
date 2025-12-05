import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getFeesSummary } from '@/server/admin/fees';

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
