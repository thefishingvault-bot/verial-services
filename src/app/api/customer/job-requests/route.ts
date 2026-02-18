import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { jobRequests, users } from "@/db/schema";
import { db } from "@/lib/db";
import {
  buildCustomerJobDescription,
  generatePublicJobToken,
  JOB_OTHER_SERVICE_MAX,
  JOB_BUDGET_OPTIONS,
  JOB_CATEGORIES,
  JOB_TIMING_OPTIONS,
} from "@/lib/customer-job-meta";
import { mapCustomerJobCategoryToProviderCategory, toProviderCategoryOrNull } from "@/lib/provider-categories";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const rate = await enforceRateLimit(req, {
    userId,
    resource: "customer-job-create",
    limit: 20,
    windowSeconds: 60,
  });
  if (!rate.success) return rateLimitResponse(rate.retryAfter);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } });
  if (!user) return new NextResponse("User not found", { status: 404 });

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

  const title = body?.title?.trim() ?? "";
  const description = body?.description?.trim() ?? "";
  const category = body?.category?.trim() ?? "";
  const budget = body?.budget?.trim() ?? "";
  const timing = body?.timing?.trim() ?? "";
  const region = body?.region?.trim() ?? "";
  const suburb = body?.suburb?.trim() ?? "";

  const normalizedCategoryId =
    toProviderCategoryOrNull(body?.categoryId ?? null) ?? mapCustomerJobCategoryToProviderCategory(category);
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
  if (body?.categoryId != null && !normalizedCategoryId) return new NextResponse("Invalid categoryId", { status: 400 });
  if (body?.otherServiceText != null && typeof body.otherServiceText !== "string") {
    return new NextResponse("Invalid otherServiceText", { status: 400 });
  }
  if (otherServiceText && otherServiceText.length > JOB_OTHER_SERVICE_MAX) {
    return new NextResponse("Invalid otherServiceText", { status: 400 });
  }
  if (normalizedCategoryId === "other" && !otherServiceText) {
    return new NextResponse("Please specify your service", { status: 400 });
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
        // Validate URL format to avoid arbitrary payloads in metadata.
        new URL(url);
      } catch {
        return new NextResponse("Invalid photoUrls", { status: 400 });
      }
    }
  }

  const persistedDescription = buildCustomerJobDescription(description, {
    category,
    categoryId: normalizedCategoryId,
    otherServiceText: normalizedCategoryId === "other" ? otherServiceText : null,
    budget,
    timing,
    requestedDate: body?.requestedDate || null,
    photoUrls: body?.photoUrls,
    publicToken: generatePublicJobToken(),
  });

  const [created] = await db
    .insert(jobRequests)
    .values({
      customerUserId: userId,
      title,
      description: persistedDescription,
      region: region || null,
      suburb: suburb || null,
      status: "open",
      paymentStatus: "pending",
      lifecycleUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const rows = await db.query.jobRequests.findMany({
    where: eq(jobRequests.customerUserId, userId),
    columns: {
      id: true,
      title: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      totalPrice: true,
      depositAmount: true,
      remainingAmount: true,
    },
    orderBy: [desc(jobRequests.createdAt)],
  });

  return NextResponse.json(rows);
}
