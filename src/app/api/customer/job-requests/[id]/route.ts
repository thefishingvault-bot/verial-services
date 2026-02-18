import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobQuotes, jobRequestInvites, jobRequestQuestions, jobRequests } from "@/db/schema";
import {
  buildCustomerJobDescription,
  JOB_OTHER_SERVICE_MAX,
  JOB_BUDGET_OPTIONS,
  JOB_CATEGORIES,
  JOB_TIMING_OPTIONS,
  parseCustomerJobDescription,
} from "@/lib/customer-job-meta";
import { mapCustomerJobCategoryToProviderCategory, toProviderCategoryOrNull } from "@/lib/provider-categories";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
      categoryId: parsedDescription.categoryId,
      otherServiceText: parsedDescription.otherServiceText,
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

  const rate = await enforceRateLimit(req, {
    userId,
    resource: "customer-job-update",
    limit: 30,
    windowSeconds: 60,
  });
  if (!rate.success) return rateLimitResponse(rate.retryAfter);

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string;
    region?: string;
    suburb?: string;
    category?: string;
    categoryId?: string | null;
    otherServiceText?: string | null;
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
  const category = body?.category?.trim() ?? "";
  const budget = body?.budget?.trim() ?? "";
  const timing = body?.timing?.trim() ?? "";
  const region = body?.region?.trim() ?? "";
  const suburb = body?.suburb?.trim() ?? "";
  const otherServiceText = typeof body?.otherServiceText === "string" ? body.otherServiceText.trim() : null;

  if (!title || title.length < 5 || title.length > 255) return new NextResponse("Invalid title", { status: 400 });
  if (!description || description.length < 20) return new NextResponse("Invalid description", { status: 400 });

  if (!category || !JOB_CATEGORIES.includes(category as (typeof JOB_CATEGORIES)[number])) {
    return new NextResponse("Invalid category", { status: 400 });
  }
  if (!budget || !JOB_BUDGET_OPTIONS.includes(budget as (typeof JOB_BUDGET_OPTIONS)[number])) {
    return new NextResponse("Invalid budget", { status: 400 });
  }
  if (!timing || !JOB_TIMING_OPTIONS.includes(timing as (typeof JOB_TIMING_OPTIONS)[number])) {
    return new NextResponse("Invalid timing", { status: 400 });
  }
  if (body?.otherServiceText != null && typeof body.otherServiceText !== "string") {
    return new NextResponse("Invalid otherServiceText", { status: 400 });
  }
  if (otherServiceText && otherServiceText.length > JOB_OTHER_SERVICE_MAX) {
    return new NextResponse("Invalid otherServiceText", { status: 400 });
  }
  if (region.length > 255 || suburb.length > 255) return new NextResponse("Invalid location", { status: 400 });

  if (body?.photoUrls !== undefined) {
    if (!Array.isArray(body.photoUrls) || body.photoUrls.length > 8) {
      return new NextResponse("Invalid photoUrls", { status: 400 });
    }

    for (const url of body.photoUrls) {
      if (typeof url !== "string" || url.trim().length === 0 || url.length > 2000) {
        return new NextResponse("Invalid photoUrls", { status: 400 });
      }
      try {
        new URL(url);
      } catch {
        return new NextResponse("Invalid photoUrls", { status: 400 });
      }
    }
  }

  const existingMeta = parseCustomerJobDescription(existing.description);
  const normalizedCategoryId =
    toProviderCategoryOrNull(body?.categoryId ?? null) ?? mapCustomerJobCategoryToProviderCategory(category);
  if (body?.categoryId != null && !toProviderCategoryOrNull(body?.categoryId)) {
    return new NextResponse("Invalid categoryId", { status: 400 });
  }
  if (normalizedCategoryId === "other" && !otherServiceText) {
    return new NextResponse("Please specify your service", { status: 400 });
  }

  const persistedDescription = buildCustomerJobDescription(description, {
    category,
    categoryId: normalizedCategoryId,
    otherServiceText: normalizedCategoryId === "other" ? otherServiceText : null,
    budget,
    timing,
    requestedDate: body?.requestedDate ?? existingMeta.requestedDate,
    photoUrls: body?.photoUrls ?? existingMeta.photoUrls,
    publicToken: existingMeta.publicToken,
  });

  const [updated] = await db
    .update(jobRequests)
    .set({
      title,
      description: persistedDescription,
      region: region || null,
      suburb: suburb || null,
      updatedAt: new Date(),
    })
    .where(eq(jobRequests.id, id))
    .returning({ id: jobRequests.id });

  return NextResponse.json(updated);
}
