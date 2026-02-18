import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jobRequestInvites, jobRequests, providers } from "@/db/schema";
import { parseCustomerJobDescription } from "@/lib/customer-job-meta";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const provider = await db.query.providers.findFirst({
    where: eq(providers.userId, userId),
    columns: { id: true, categories: true },
  });
  if (!provider) return new NextResponse("Provider account required", { status: 403 });

  const providerCategories = new Set(provider.categories ?? []);
  if (providerCategories.size === 0) {
    return NextResponse.json([]);
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status")?.trim() ?? null;

  const invites = await db.query.jobRequestInvites.findMany({
    where: and(eq(jobRequestInvites.providerId, provider.id), inArray(jobRequestInvites.status, ["pending", "accepted"])),
    columns: { jobRequestId: true },
  });
  const invitedJobIds = invites.map((row) => row.jobRequestId);

  const baseWhere = invitedJobIds.length
    ? or(
        eq(jobRequests.status, "open"),
        eq(jobRequests.assignedProviderId, userId),
        inArray(jobRequests.id, invitedJobIds),
      )
    : or(eq(jobRequests.status, "open"), eq(jobRequests.assignedProviderId, userId));

  const rows = await db.query.jobRequests.findMany({
    where: statusFilter
      ? and(baseWhere, eq(jobRequests.status, statusFilter as typeof jobRequests.$inferSelect.status))
      : baseWhere,
    columns: {
      id: true,
      title: true,
      description: true,
      region: true,
      suburb: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      assignedProviderId: true,
    },
    orderBy: [desc(jobRequests.createdAt)],
  });

  const filteredRows = rows
    .filter((row) => {
      const parsed = parseCustomerJobDescription(row.description);
      return !!parsed.categoryId && providerCategories.has(parsed.categoryId);
    })
    .map(({ description: _description, ...row }) => row);

  return NextResponse.json(filteredRows);
}
