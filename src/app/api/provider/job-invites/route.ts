import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobRequestInvites, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true },
  });
  if (!provider) return new NextResponse("Provider account required", { status: 403 });

  const invites = await db.query.jobRequestInvites.findMany({
    where: and(
      eq(jobRequestInvites.providerId, provider.id),
      inArray(jobRequestInvites.status, ["pending", "accepted"]),
    ),
    with: {
      jobRequest: {
        columns: { id: true, title: true, status: true, suburb: true, region: true, createdAt: true },
      },
    },
    orderBy: [desc(jobRequestInvites.createdAt)],
  });

  return NextResponse.json(invites);
}
