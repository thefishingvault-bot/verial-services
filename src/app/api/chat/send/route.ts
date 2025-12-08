import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return new NextResponse("This endpoint has been replaced by /api/messages", {
    status: 410,
  });
}
