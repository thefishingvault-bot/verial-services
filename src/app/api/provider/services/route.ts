import { db } from "@/lib/db";
import { services, providers } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
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

    const providerServices = await db.query.services.findMany({
      where: eq(services.providerId, provider.id),
      orderBy: [desc(services.createdAt)],
    });

    return NextResponse.json(providerServices);
  } catch (error) {
    console.error("[API_PROVIDER_SERVICES_LIST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

