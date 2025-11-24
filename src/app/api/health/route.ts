import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Simple query to verify database connectivity
    await db.execute(sql`SELECT 1`);

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
    });
  } catch (error) {
    console.error('[HEALTH_CHECK_FAILED]', error);
    return NextResponse.json(
      { status: 'error', database: 'disconnected' },
      { status: 500 },
    );
  }
}
