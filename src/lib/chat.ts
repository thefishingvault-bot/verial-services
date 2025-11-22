import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
	bookings,
	conversations,
	messages,
	providers,
	users,
} from "@/db/schema";

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
				columns: {
					id: true,
					firstName: true,
					lastName: true,
					avatarUrl: true,
					providerId: true,
				},
			},
			user2: {
				columns: {
					id: true,
					firstName: true,
					lastName: true,
					avatarUrl: true,
					providerId: true,
				},
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

			// Figure out which participant is the provider for naming
			const providerUser =
				c.user1.providerId || c.user2.providerId
					? await db.query.users.findFirst({
						where: eq(
							users.id,
							c.user1.providerId ? c.user1.id : c.user2.id,
						),
					})
					: null;

			const providerEntity = providerUser
				? await db.query.providers.findFirst({
						where: eq(providers.userId, providerUser.id),
					})
				: null;

			const booking = await db.query.bookings.findFirst({
				where: or(eq(bookings.userId, c.user1Id), eq(bookings.userId, c.user2Id)),
				with: {
					service: { columns: { title: true } },
					provider: { columns: { id: true } },
				},
			});

			// Prefer provider business name in the list when available
			const counterpartDisplayName =
				providerEntity?.businessName ||
				`${otherUser.firstName || "User"} ${otherUser.lastName || ""}`.trim();

			return {
				id: c.id,
				counterpart: {
					id: otherUser.id,
					name: counterpartDisplayName,
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

