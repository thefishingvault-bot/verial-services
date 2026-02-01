"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import { parseUsername } from "@/lib/username";
import { NZ_REGIONS } from "@/lib/nz-regions";

const onboardingSchema = z.object({
  username: z.string().min(3).max(20),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone is required"),

  addressLine1: z.string().min(1, "Address line 1 is required"),
  addressLine2: z.string().optional().nullable(),
  suburb: z.string().min(1, "Suburb is required"),
  city: z.string().min(1, "City is required"),
  region: z.enum(NZ_REGIONS, { message: "Region is required" }),
  postcode: z.string().min(1, "Postcode is required"),

  acceptTerms: z.boolean().refine((v) => v === true, "You must accept the terms"),
  acceptPrivacy: z.boolean().refine((v) => v === true, "You must accept the privacy policy"),
  confirm18Plus: z.boolean().refine((v) => v === true, "You must confirm you are 18+"),
});

export type SubmitOnboardingResult =
  | { ok: true }
  | { ok: false; formError: string }
  | { ok: false; fieldErrors: Record<string, string> };

function getDbErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as { code?: unknown; cause?: unknown };
  if (typeof anyErr.code === "string") return anyErr.code;
  const cause = anyErr.cause as { code?: unknown } | undefined;
  if (cause && typeof cause.code === "string") return cause.code;
  return null;
}

export async function submitOnboarding(payload: unknown): Promise<SubmitOnboardingResult> {
  const parsed = onboardingSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  const usernameParsed = parseUsername(parsed.data.username);
  if (!usernameParsed.ok) {
    return { ok: false, fieldErrors: { username: usernameParsed.message } };
  }

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, formError: "Unauthorized" };
  }

  // Ensure a local row exists for the current user.
  await ensureUserExistsInDb(userId, "customer");

  // Pre-check availability to provide friendly feedback.
  const existing = await db.query.users.findFirst({
    where: eq(users.usernameLower, usernameParsed.normalized),
    columns: { id: true },
  });
  if (existing && existing.id !== userId) {
    return { ok: false, fieldErrors: { username: "That username is already taken" } };
  }

  const now = new Date();

  try {
    // Update Clerk names for consistency across the product.
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    });

    await db
      .update(users)
      .set({
        username: usernameParsed.normalized,
        usernameLower: usernameParsed.normalized,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
        addressLine1: parsed.data.addressLine1,
        addressLine2: parsed.data.addressLine2 || null,
        suburb: parsed.data.suburb,
        city: parsed.data.city,
        region: parsed.data.region,
        postcode: parsed.data.postcode,
        acceptedTermsAt: now,
        acceptedPrivacyAt: now,
        confirmed18PlusAt: now,
        profileCompleted: true,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    return { ok: true };
  } catch (err) {
    const code = getDbErrorCode(err);

    // Unique constraint violation (e.g. users_username_lower_unique)
    if (code === "23505") {
      return { ok: false, fieldErrors: { username: "That username is already taken" } };
    }

    console.error("[SUBMIT_ONBOARDING]", err);
    return { ok: false, formError: "Unable to complete onboarding right now" };
  }
}
