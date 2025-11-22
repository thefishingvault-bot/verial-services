import { auth } from "@clerk/nextjs/server";
import { desc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { bookings, conversations, messages } from "@/db/schema";

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
	const userConversations = await db.query.conversations.findMany({
		where: or(eq(conversations.user1Id, userId), eq(conversations.user2Id, userId)),
		with: {
			user1: {
				columns: { id: true, firstName: true, lastName: true, avatarUrl: true },
			},
			user2: {
				columns: { id: true, firstName: true, lastName: true, avatarUrl: true },
			},
			messages: {
				orderBy: [desc(messages.createdAt)],
				limit: 1,
			},
		},
		orderBy: [desc(conversations.lastMessageAt)],
	});

	const formatted: ConversationSummary[] = await Promise.all(
		userConversations.map(async (c) => {
			const otherUser = c.user1Id === userId ? c.user2 : c.user1;
			const lastMsg = c.messages[0];

			const booking = await db.query.bookings.findFirst({
				where: or(eq(bookings.userId, c.user1Id), eq(bookings.userId, c.user2Id)),
				with: {
					service: { columns: { title: true } },
					provider: { columns: { id: true } },
				},
			});

			return {
				id: c.id,
				counterpart: {
					id: otherUser.id,
					name: `${otherUser.firstName || "User"} ${
						otherUser.lastName || ""
					}`.trim(),
					handle: undefined,
					avatarUrl: otherUser.avatarUrl,
				},
				lastMessage: lastMsg ? lastMsg.content : "No messages yet",
				lastMessageAt: c.lastMessageAt?.toISOString?.()
					?? new Date().toISOString(),
				unreadCount: 0,
				booking: booking
					? {
							publicRef: booking.id,
							serviceTitle: booking.service.title,
						}
					: null,
			};
		}),
	);

	return formatted;
}

