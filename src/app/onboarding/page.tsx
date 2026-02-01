import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import { users } from "@/db/schema";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export const runtime = "nodejs";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  await ensureUserExistsInDb(userId, "user");

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      usernameLower: true,
      firstName: true,
      lastName: true,
    },
  });

  if (user?.usernameLower) {
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

      <OnboardingForm initialFirstName={user?.firstName ?? null} initialLastName={user?.lastName ?? null} />

      <p className="text-xs text-muted-foreground">
        Your username will be used for mentions and future profile features.
      </p>
    </div>
  );
}
