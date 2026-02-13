import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { jobRequests } from "@/db/schema";
import { db } from "@/lib/db";
import {
  buildCustomerJobDescription,
  generatePublicJobToken,
  parseCustomerJobDescription,
} from "@/lib/customer-job-meta";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
    columns: {
      id: true,
      description: true,
    },
  });

  if (!job) return new NextResponse("Not found", { status: 404 });

  const parsed = parseCustomerJobDescription(job.description);
  const token = parsed.publicToken ?? generatePublicJobToken();

  if (!parsed.publicToken) {
    const persistedDescription = buildCustomerJobDescription(parsed.description, {
      category: parsed.category,
      budget: parsed.budget,
      timing: parsed.timing,
      requestedDate: parsed.requestedDate,
      photoUrls: parsed.photoUrls,
      publicToken: token,
    });

    await db
      .update(jobRequests)
      .set({
        description: persistedDescription,
        updatedAt: new Date(),
      })
      .where(eq(jobRequests.id, id));
  }

  const configuredBase = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const origin = configuredBase && configuredBase.length > 0 ? configuredBase : new URL(req.url).origin;

  return NextResponse.json({
    token,
    url: `${origin}/jobs/public/${token}`,
  });
}
