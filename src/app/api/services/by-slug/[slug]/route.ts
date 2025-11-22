import { db } from "@/lib/db";
import { services } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return new NextResponse("Missing slug", { status: 400 });
    }

    const service = await db.query.services.findFirst({
      where: eq(services.slug, slug),
      with: {
        provider: {
          columns: {
            userId: true,
            handle: true,
            businessName: true,
            isVerified: true,
            trustLevel: true,
            bio: true,
          },
          with: {
            user: {
              columns: {
                email: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      return new NextResponse("Service not found", { status: 404 });
    }

    return NextResponse.json(service);

  } catch (error) {
    console.error("[API_SERVICE_BY_SLUG]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

