import { Suspense } from "react";
import { WaitlistClient } from "./waitlist-client";

export default function WaitlistPage() {
  return (
    <div className="container mx-auto max-w-lg px-4 py-10">
      <Suspense fallback={null}>
        <WaitlistClient />
      </Suspense>
    </div>
  );
}
