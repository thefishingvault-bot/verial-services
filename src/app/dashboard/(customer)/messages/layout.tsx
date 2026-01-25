import type { ReactNode } from "react";

export default function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/10">
      {children}
    </main>
  );
}
