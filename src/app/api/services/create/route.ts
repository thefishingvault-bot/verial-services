import { db } from "@/lib/db";
import { services, serviceCategoryEnum, providers } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// Helper function to create a unique ID
const generateServiceId = () => `svc_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper function to create a slug
const createSlug = (title: string) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/[\s-]+/g, '-')     // Replace spaces/hyphens with a single hyphen
    .replace(/^-+|-+$/g, '');    // Trim hyphens
};

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get the provider record for this user
    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Not a provider. Register as a provider first.", { status: 403 });
    }

    // --- TODO: Check if provider is verified ---
    // We will add this check later. For now, any provider can create.

    const { title, description, priceInCents, category } = await req.json();

    if (!title || !priceInCents || !category) {
      return new NextResponse("Missing required fields: title, priceInCents, category", { status: 400 });
    }

    if (!serviceCategoryEnum.enumValues.includes(category)) {
      return new NextResponse(`Invalid category: ${category}`, { status: 400 });
    }

    const slug = createSlug(title);

    const [newService] = await db.insert(services).values({
      id: generateServiceId(),
      providerId: provider.id,
      title: title,
      description: description,
      priceInCents: priceInCents,
      category: category,
      slug: `${slug}-${Math.random().toString(36).substring(2, 8)}`, // Add random suffix to ensure uniqueness for MVP
      chargesGst: provider.chargesGst,
    }).returning();

    console.log(`[API_SERVICE_CREATE] Provider ${provider.id} created Service ${newService.id}`);
    return NextResponse.json(newService);

  } catch (error) {
    console.error("[API_SERVICE_CREATE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

