import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ConversationSummary {
  id: string;
  counterpartName: string;
  counterpartHandle: string;
  counterpartAvatarUrl: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  serviceTitle?: string | null;
  bookingRef?: string | null;
}

async function fetchConversations(): Promise<ConversationSummary[]> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const res = await fetch(`${baseUrl}/api/chat/conversations`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return [];
  }

  const data: {
    conversations?: {
      id: string;
      counterpart: {
        id: string;
        name: string;
        handle?: string;
        avatarUrl: string | null;
      };
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
      booking?: {
        publicRef: string;
        serviceTitle: string;
      } | null;
    }[];
  } = await res.json();

  return (data.conversations ?? []).map((c) => ({
    id: c.id,
    counterpartName: c.counterpart?.name ?? "Unknown",
    counterpartHandle: c.counterpart?.handle ?? "",
    counterpartAvatarUrl: c.counterpart?.avatarUrl ?? null,
    lastMessagePreview: c.lastMessage ?? "No messages yet",
    lastMessageAt: c.lastMessageAt ?? new Date().toISOString(),
    unreadCount: c.unreadCount ?? 0,
    serviceTitle: c.booking?.serviceTitle ?? null,
    bookingRef: c.booking?.publicRef ?? null,
  }));
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

interface ConversationListProps {
  activeConversationId?: string | null;
}

export async function ConversationList({
  activeConversationId,
}: ConversationListProps) {
  const conversations = await fetchConversations();

  if (!conversations.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">No conversations yet</p>
        <p className="max-w-[220px] text-[11px] text-muted-foreground">
          Once you book providers, your conversations will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y text-sm">
      {conversations.map((c) => {
        const isActive = c.id === activeConversationId;
        return (
          <li key={c.id}>
            <Link
              href={`/dashboard/messages/${c.id}`}
              className={`flex gap-3 px-4 py-3 text-xs hover:bg-muted/60 ${
                isActive
                  ? "border-l-2 border-sky-500 bg-muted/80 font-medium"
                  : "border-l-2 border-transparent"
              }`}
            >
              <Avatar className="mt-0.5 h-8 w-8">
                {c.counterpartAvatarUrl && (
                  <AvatarImage
                    src={c.counterpartAvatarUrl}
                    alt={c.counterpartName}
                  />
                )}
                <AvatarFallback>
                  {c.counterpartName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate">{c.counterpartName}</p>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {formatTime(c.lastMessageAt)}
                  </span>
                </div>

                <p className="truncate text-[11px] text-muted-foreground">
                  {c.serviceTitle
                    ? c.serviceTitle
                    : c.bookingRef
                      ? `Booking #${c.bookingRef}`
                      : "Direct message"}
                </p>

                <p className="truncate text-[11px] text-muted-foreground">
                  {c.lastMessagePreview || "No messages yet"}
                </p>
              </div>

              {c.unreadCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-1 text-[11px] font-semibold text-white">
                  {c.unreadCount}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
