"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SignOutAction } from "@/components/auth/sign-out-button";

export function AdminHeader() {
  const pathname = usePathname();
  const showBack = pathname !== "/dashboard/admin";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {showBack ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/admin">Back to Dashboard</Link>
          </Button>
        ) : null}
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>
      <SignOutAction />
    </div>
  );
}
