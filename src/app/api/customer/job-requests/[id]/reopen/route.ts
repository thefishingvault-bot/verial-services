import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobRequests } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const existing = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
    columns: { id: true, status: true },
  });

  if (!existing) return new NextResponse("Not found", { status: 404 });
  if (existing.status !== "cancelled" && existing.status !== "closed" && existing.status !== "expired") {
    return new NextResponse("Job cannot be reopened", { status: 409 });
  }

  const [updated] = await db
    .update(jobRequests)
    .set({
      status: "open",
      lifecycleUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobRequests.id, id))
    .returning({ id: jobRequests.id, status: jobRequests.status });

  return NextResponse.json(updated);
}