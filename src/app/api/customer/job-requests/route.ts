import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { jobRequests, users } from "@/db/schema";
import { db } from "@/lib/db";
import { buildCustomerJobDescription } from "@/lib/customer-job-meta";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } });
  if (!user) return new NextResponse("User not found", { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string;
    region?: string;
    suburb?: string;
    category?: string;
    budget?: string;
    timing?: string;
    requestedDate?: string | null;
  } | null;

  const title = body?.title?.trim() ?? "";
  const description = body?.description?.trim() ?? "";

  if (!title || title.length < 5 || title.length > 255) return new NextResponse("Invalid title", { status: 400 });
  if (!description || description.length < 20) return new NextResponse("Invalid description", { status: 400 });

  const persistedDescription = buildCustomerJobDescription(description, {
    category: body?.category,
    budget: body?.budget,
    timing: body?.timing,
    requestedDate: body?.requestedDate || null,
  });

  const [created] = await db
    .insert(jobRequests)
    .values({
      customerUserId: userId,
      title,
      description: persistedDescription,
      region: body?.region?.trim() || null,
      suburb: body?.suburb?.trim() || null,
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
