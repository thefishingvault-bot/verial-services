"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignOutAction({ label = "Sign out" }: { label?: string }) {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <Button variant="outline" size="sm">{label}</Button>
    </SignOutButton>
  );
}
