import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// This is a public route, no auth needed.
export async function GET(req: Request) {
  try {
    // Fetch all services and join with their provider's details
    const allServices = await db.query.services.findMany({
      with: {
        provider: {
          columns: {
            handle: true,
            businessName: true,
            isVerified: true,
            trustLevel: true,
          },
        },
      },
      // TODO: Add pagination, sorting (by trust), and filtering
    });

    return NextResponse.json(allServices);

  } catch (error) {
    console.error("[API_SERVICE_LIST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

