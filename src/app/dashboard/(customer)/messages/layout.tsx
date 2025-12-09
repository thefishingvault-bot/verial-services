import type { ReactNode } from "react";

export default function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="flex h-[calc(100vh-4rem)] min-w-0 flex-1 flex-col overflow-hidden bg-muted/10">
      {children}
    </main>
  );
}
