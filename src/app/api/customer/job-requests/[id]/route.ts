import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobQuotes, jobRequestInvites, jobRequestQuestions, jobRequests } from "@/db/schema";
import { buildCustomerJobDescription, parseCustomerJobDescription } from "@/lib/customer-job-meta";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const job = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
  });

  if (!job) return new NextResponse("Not found", { status: 404 });

  const parsedDescription = parseCustomerJobDescription(job.description);

  const [quotes, questions, invites] = await Promise.all([
    db.query.jobQuotes.findMany({
      where: eq(jobQuotes.jobRequestId, id),
      with: { provider: { columns: { id: true, businessName: true, handle: true } } },
    }),
    db.query.jobRequestQuestions.findMany({ where: eq(jobRequestQuestions.jobRequestId, id) }),
    db.query.jobRequestInvites.findMany({
      where: eq(jobRequestInvites.jobRequestId, id),
      with: { provider: { columns: { id: true, businessName: true, handle: true } } },
    }),
  ]);

  return NextResponse.json({
    job: {
      ...job,
      description: parsedDescription.description,
      category: parsedDescription.category,
      budget: parsedDescription.budget,
      timing: parsedDescription.timing,
      requestedDate: parsedDescription.requestedDate,
      photoUrls: parsedDescription.photoUrls,
    },
    quotes,
    questions,
    invites,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string;
    region?: string;
    suburb?: string;
    category?: string;
    budget?: string;
    timing?: string;
    requestedDate?: string | null;
    photoUrls?: string[];
  } | null;

  const existing = await db.query.jobRequests.findFirst({
    where: and(eq(jobRequests.id, id), eq(jobRequests.customerUserId, userId)),
    columns: {
      id: true,
      status: true,
      description: true,
    },
  });

  if (!existing) return new NextResponse("Not found", { status: 404 });
  if (existing.status !== "open") return new NextResponse("Job can no longer be edited", { status: 409 });

  const title = body?.title?.trim() ?? "";
  const description = body?.description?.trim() ?? "";

  if (!title || title.length < 5 || title.length > 255) return new NextResponse("Invalid title", { status: 400 });
  if (!description || description.length < 20) return new NextResponse("Invalid description", { status: 400 });

  const existingMeta = parseCustomerJobDescription(existing.description);

  const persistedDescription = buildCustomerJobDescription(description, {
    category: body?.category ?? existingMeta.category,
    budget: body?.budget ?? existingMeta.budget,
    timing: body?.timing ?? existingMeta.timing,
    requestedDate: body?.requestedDate ?? existingMeta.requestedDate,
    photoUrls: body?.photoUrls ?? existingMeta.photoUrls,
  });

  const [updated] = await db
    .update(jobRequests)
    .set({
      title,
      description: persistedDescription,
      region: body?.region?.trim() || null,
      suburb: body?.suburb?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(jobRequests.id, id))
    .returning({ id: jobRequests.id });

  return NextResponse.json(updated);
}
