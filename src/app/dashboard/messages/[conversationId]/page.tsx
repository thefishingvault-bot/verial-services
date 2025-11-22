"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatThread } from "@/components/messages/chat-thread";
import { ConversationHeader } from "@/components/messages/conversation-header";

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface ConversationContext {
	messages: {
		id: string;
		content: string;
		senderId: string;
		createdAt: string;
		sender: {
			firstName: string | null;
			lastName: string | null;
			avatarUrl: string | null;
		};
	}[];
	booking: {
		id: string;
		publicRef: string;
		serviceTitle: string;
		scheduledAt: string | null;
		totalInCents: number;
		includesGst: boolean;
		status: BookingStatus;
	} | null;
	provider: {
		id: string;
		name: string;
		handle: string;
		avatarUrl: string | null;
		rating?: number;
		jobsCompleted?: number;
		isVerified: boolean;
	} | null;
	customer: {
		id: string;
		name: string;
		handle: string;
		avatarUrl: string | null;
	};
	viewerRole: "provider" | "customer";
}

export default function ConversationPage() {
	const params = useParams();
	const conversationId = params.conversationId as string;

	const [data, setData] = useState<ConversationContext | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!conversationId) return;

		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

		fetch(`${baseUrl}/api/chat/${conversationId}/messages`, {
			cache: "no-store",
		})
			.then((res) => {
				if (!res.ok) {
					throw new Error("Failed to load conversation");
				}
				return res.json();
			})
			.then((json: ConversationContext) => {
				setData(json);
				setIsLoading(false);
			})
			.catch((err: Error) => {
				setError(err.message);
				setIsLoading(false);
			});
	}, [conversationId]);

	if (isLoading) {
		return (
			<div className="flex h-[calc(100vh-8rem)] items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading conversation…</p>
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="flex h-[calc(100vh-8rem)] items-center justify-center">
				<p className="text-sm text-red-500">
					{error || "Error loading conversation."}
				</p>
			</div>
		);
	}

	const { booking, provider, customer, viewerRole, messages } = data;
	const isProviderViewer = viewerRole === "provider";
	const counterpart =
		viewerRole === "provider" ? customer : provider ?? customer;
	const viewerUserId = isProviderViewer ? provider?.id ?? null : customer.id;

	return (
		<div className="flex h-full flex-1 flex-col px-4 py-4 md:px-8 md:py-6">
			<div className="mx-auto flex h-full w-full max-w-4xl flex-1 flex-col rounded-xl border bg-white shadow-sm">
				{counterpart && (
					<ConversationHeader
						listHref="/dashboard/messages"
						counterpartName={counterpart.name}
						counterpartHandle={counterpart.handle}
						counterpartAvatarUrl={counterpart.avatarUrl}
						counterpartRole={isProviderViewer ? "customer" : "provider"}
						serviceTitle={booking?.serviceTitle ?? "Direct message"}
						bookingRef={booking?.publicRef ?? null}
						scheduledAt={booking?.scheduledAt ?? null}
						amountInCents={booking?.totalInCents ?? null}
						includesGst={booking?.includesGst ?? null}
						status={booking?.status ?? null}
						rating={provider?.rating}
						jobsCompleted={provider?.jobsCompleted}
						isVerified={provider?.isVerified ?? false}
						bookingUrl={
							booking
								? `/dashboard/bookings/${booking.id}`
								: null
						}
						profileUrl={
							isProviderViewer
								? `/dashboard/customers/${customer.id}`
								: provider
									? `/p/${provider.handle}`
									: "/dashboard/profile"
						}
					/>
				)}

				<div className="flex min-h-0 flex-1 flex-col">
					<ChatThread
						conversationId={conversationId}
						viewerUserId={viewerUserId}
						counterpart={{
							id: counterpart.id,
							name: counterpart.name,
							handle: counterpart.handle,
							avatarUrl: counterpart.avatarUrl,
						}}
						initialMessages={messages}
					/>
				</div>
			</div>
		</div>
	);
}

