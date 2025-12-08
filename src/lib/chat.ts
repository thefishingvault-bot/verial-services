import { auth } from "@clerk/nextjs/server";

import { listUserThreads } from "@/lib/messaging";

export interface ConversationSummary {
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
	booking: {
		publicRef: string;
		serviceTitle: string;
	} | null;
}

export async function getAuthenticatedUserId() {
	const { userId } = await auth();
	return userId ?? null;
}

export async function getConversationsForUser(
	userId: string,
): Promise<ConversationSummary[]> {
	const threads = await listUserThreads(userId);

	return threads.map((thread) => ({
		id: thread.bookingId,
		counterpart: {
			id: thread.counterpart.id,
			name: thread.counterpart.name,
			handle: undefined,
			avatarUrl: thread.counterpart.avatarUrl,
		},
		lastMessage: thread.lastMessage ?? "No messages yet",
		lastMessageAt: thread.lastMessageAt ? new Date(thread.lastMessageAt).toISOString() : new Date().toISOString(),
		unreadCount: thread.unreadCount,
		booking: {
			publicRef: thread.bookingId,
			serviceTitle: thread.serviceTitle,
		},
	}));
}

