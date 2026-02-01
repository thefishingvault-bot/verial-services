import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import { users } from "@/db/schema";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

function isUndefinedColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: unknown; cause?: unknown; message?: unknown };
  if (anyErr.code === "42703") return true;
  const anyCause = anyErr.cause as { code?: unknown; message?: unknown } | undefined;
  if (anyCause?.code === "42703") return true;
  const msg = typeof anyErr.message === "string" ? anyErr.message : "";
  const causeMsg = typeof anyCause?.message === "string" ? anyCause.message : "";
  return (msg + "\n" + causeMsg).includes("does not exist") && (msg + "\n" + causeMsg).includes("column");
}

export const runtime = "nodejs";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  await ensureUserExistsInDb(userId, "customer");

  let user:
    | {
        profileCompleted: boolean;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        suburb: string | null;
        city: string | null;
        region: string | null;
        postcode: string | null;
      }
    | undefined;

  try {
    user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        profileCompleted: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        suburb: true,
        city: true,
        region: true,
        postcode: true,
      },
    });
  } catch (err) {
    // If the DB hasn't had the username migration applied yet, fail gracefully.
    if (isUndefinedColumnError(err)) {
      redirect("/waitlist");
    }
    throw err;
  }

  if (user?.profileCompleted) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Before you continue, we just need a few details.
        </p>
      </div>

      <OnboardingForm
        initialValues={{
          username: user?.username ?? "",
          firstName: user?.firstName ?? "",
          lastName: user?.lastName ?? "",
          phone: user?.phone ?? "",
          addressLine1: user?.addressLine1 ?? "",
          addressLine2: user?.addressLine2 ?? "",
          suburb: user?.suburb ?? "",
          city: user?.city ?? "",
          region: user?.region ?? "",
          postcode: user?.postcode ?? "",
        }}
      />

      <p className="text-xs text-muted-foreground">Your profile helps providers contact you and serve you in the right area.</p>
    </div>
  );
}
