import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobRequestInvites, jobRequests, providers } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { providerId?: string } | null;
  const providerId = body?.providerId?.trim();
  if (!providerId) return new NextResponse("Missing providerId", { status: 400 });

  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
    columns: { id: true, status: true },
  });
  if (!job) return new NextResponse("Job not found", { status: 404 });
  if (job.status !== "open") return new NextResponse("Invites allowed only for open jobs", { status: 400 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.id, providerId),
    columns: { id: true },
  });
  if (!provider) return new NextResponse("Provider not found", { status: 404 });

  const [invite] = await db
    .insert(jobRequestInvites)
    .values({
      jobRequestId: id,
      providerId,
      invitedByUserId: userId,
      status: "pending",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [jobRequestInvites.jobRequestId, jobRequestInvites.providerId],
      set: { status: "pending", updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json(invite);
}
