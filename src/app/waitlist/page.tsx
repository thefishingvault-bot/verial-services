import { Suspense } from "react";
import { WaitlistClient } from "./waitlist-client";

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="bg-gradient-to-b from-background via-background/80 to-transparent">
        <div className="container mx-auto max-w-lg px-4 py-10">
          <Suspense fallback={null}>
            <WaitlistClient />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
