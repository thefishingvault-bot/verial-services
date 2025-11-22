"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
				setIsLoading(false);
				setData(json);
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

	return (
		<div className="flex h-full flex-col bg-muted/10">
			{counterpart && (
				<ConversationHeader
					listHref="/dashboard/messages"
					counterpartName={counterpart.name}
					counterpartHandle={counterpart.handle}
					counterpartAvatarUrl={counterpart.avatarUrl}
					counterpartRole={isProviderViewer ? "customer" : "provider"}
					serviceTitle={booking?.serviceTitle ?? "Direct message"}
					bookingRef={booking?.publicRef ?? "—"}
					scheduledAt={
						booking?.scheduledAt ?? new Date().toISOString()
					}
					amountInCents={booking?.totalInCents ?? 0}
					includesGst={booking?.includesGst ?? false}
					status={booking?.status ?? "pending"}
					rating={provider?.rating}
					jobsCompleted={provider?.jobsCompleted}
					isVerified={provider?.isVerified ?? false}
					bookingUrl={
						booking
							? `/dashboard/bookings/${booking.id}`
							: "/dashboard/bookings"
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

			<div className="flex flex-1 flex-col">
				<div className="flex-1 space-y-4 overflow-y-auto p-4">
					{messages.length === 0 && (
						<p className="mt-10 text-center text-muted-foreground">
							No messages yet. Say hello!
						</p>
					)}

					{messages.map((msg) => {
						const isMe = false; // viewer id not available client-side here yet
						return (
							<div
								key={msg.id}
								className={`flex ${isMe ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`flex max-w-[80%] items-end gap-2 ${
										isMe ? "flex-row-reverse" : "flex-row"
									}`}
								>
									{!isMe && (
										<div className="h-6 w-6 rounded-full bg-muted" />
									)}
									<div
										className={`rounded-lg p-3 ${
											isMe
												? "bg-primary text-primary-foreground"
												: "bg-muted"
										}`}
									>
										<p className="text-sm">{msg.content}</p>
										<span className="mt-1 block text-right text-[10px] opacity-70">
											{new Date(msg.createdAt).toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									</div>
								</div>
							</div>
						);
					})}
				</div>

				<div className="border-t bg-background p-4">
					{/* Input will be added/enhanced in a later step */}
				</div>
			</div>
		</div>
	);
}

