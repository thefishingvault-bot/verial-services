import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { listUserThreads } from "@/lib/messaging";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const threads = await listUserThreads(userId);
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("[API_MESSAGES_LIST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
