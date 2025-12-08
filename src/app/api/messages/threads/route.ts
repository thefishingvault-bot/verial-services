import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { listUserThreads } from "@/lib/messaging";
import { ThreadListSchema } from "@/lib/validation/messages";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const parsed = ThreadListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });

    const threads = await listUserThreads(userId);
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("[API_MESSAGES_THREADS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
