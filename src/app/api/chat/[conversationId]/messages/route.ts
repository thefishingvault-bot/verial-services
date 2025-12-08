import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse("This endpoint has been replaced by /api/messages", { status: 410 });
}
