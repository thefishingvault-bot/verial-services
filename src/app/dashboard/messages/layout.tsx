import type { ReactNode } from "react";
import { ConversationList } from "@/components/messages/conversation-list";

export default function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex h-full overflow-hidden bg-muted/10">
      {/* LEFT: inbox / conversations list */}
      <aside className="hidden w-full max-w-xs flex-col border-r bg-white md:flex">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-sm font-semibold">Messages</h1>
        </div>

        <div className="border-b px-4 py-2">
          <input
            type="text"
            placeholder="Search conversations…"
            className="h-8 w-full rounded-md border px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <ConversationList />
        </div>
      </aside>

      {/* RIGHT: active conversation */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/10">
        {children}
      </main>
    </div>
  );
}
