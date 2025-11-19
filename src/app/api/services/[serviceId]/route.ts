import { db } from "@/lib/db";
import { services, providers, serviceCategoryEnum } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

// GET: Fetch a single service for editing
export async function GET(
  req: Request,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  try {
    const { serviceId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });
    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const service = await db.query.services.findFirst({
      where: and(
        eq(services.id, serviceId),
        eq(services.providerId, provider.id),
      ),
    });

    if (!service) {
      return new NextResponse("Service not found", { status: 404 });
    }

    return NextResponse.json(service);
  } catch (error) {
    console.error("[API_SERVICE_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// PATCH: Update service details
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  try {
    const { serviceId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const body = (await req.json()) as {
      title?: string;
      description?: string | null;
      priceInCents?: number;
      category?: string;
      chargesGst?: boolean;
    };
    const { title, description, priceInCents, category, chargesGst } = body;

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });
    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    let categoryValue: (typeof serviceCategoryEnum.enumValues)[number] | undefined;
    if (category !== undefined) {
      if (!serviceCategoryEnum.enumValues.includes(category as (typeof serviceCategoryEnum.enumValues)[number])) {
        return new NextResponse("Invalid category", { status: 400 });
      }
      categoryValue = category as (typeof serviceCategoryEnum.enumValues)[number];
    }

    const [updatedService] = await db
      .update(services)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(priceInCents !== undefined && { priceInCents }),
        ...(categoryValue !== undefined && { category: categoryValue }),
        ...(chargesGst !== undefined && { chargesGst }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(services.id, serviceId),
          eq(services.providerId, provider.id),
        ),
      )
      .returning();

    if (!updatedService) {
      return new NextResponse("Service not found or access denied", { status: 404 });
    }

    return NextResponse.json(updatedService);
  } catch (error) {
    console.error("[API_SERVICE_UPDATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}


export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  try {
    const { serviceId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const [deleted] = await db
      .delete(services)
      .where(
        and(
          eq(services.id, serviceId),
          eq(services.providerId, provider.id),
        ),
      )
      .returning();

    if (!deleted) {
      return new NextResponse("Service not found or access denied", { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_SERVICE_DELETE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

