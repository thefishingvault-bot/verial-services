// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";

let mockRole: string = "user";

vi.mock("@/lib/auth-guards", () => ({
	requireCustomer: vi.fn(() =>
		Promise.resolve({
			userId: "test_user",
			role: mockRole,
		})
	),
}));

describe("dashboard role-based redirects", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("redirects providers from /dashboard/messages to /dashboard/provider/messages", async () => {
		mockRole = "provider";

		vi.mock("@/components/messages/messages-shell", () => ({
			MessagesShell: () => null,
		}));

		vi.mock("next/navigation", () => ({
			redirect: (url: string) => {
				const err: any = new Error("REDIRECT");
				err.redirect = url;
				throw err;
			},
		}));

		const { default: MessagesPage } = await import("@/app/dashboard/(customer)/messages/page");

		try {
			await MessagesPage();
			throw new Error("Expected redirect, but function completed normally");
		} catch (err: any) {
			expect(err.redirect).toBe("/dashboard/provider/messages");
		}
	});

	it("redirects providers from /dashboard/messages/:id to /dashboard/provider/messages/:id", async () => {
		mockRole = "provider";

		vi.mock("@/components/messages/messages-shell", () => ({
			MessagesShell: () => null,
		}));

		vi.mock("next/navigation", () => ({
			redirect: (url: string) => {
				const err: any = new Error("REDIRECT");
				err.redirect = url;
				throw err;
			},
		}));

		const { default: ConversationPage } = await import(
			"@/app/dashboard/(customer)/messages/[conversationId]/page"
		);

		try {
			await ConversationPage({ params: Promise.resolve({ conversationId: "booking_123" }) });
			throw new Error("Expected redirect, but function completed normally");
		} catch (err: any) {
			expect(err.redirect).toBe("/dashboard/provider/messages/booking_123");
		}
	});

	it("redirects admins from /dashboard/messages to /dashboard/provider/messages", async () => {
		mockRole = "admin";

		vi.mock("@/components/messages/messages-shell", () => ({
			MessagesShell: () => null,
		}));

		vi.mock("next/navigation", () => ({
			redirect: (url: string) => {
				const err: any = new Error("REDIRECT");
				err.redirect = url;
				throw err;
			},
		}));

		const { default: MessagesPage } = await import("@/app/dashboard/(customer)/messages/page");

		try {
			await MessagesPage();
			throw new Error("Expected redirect, but function completed normally");
		} catch (err: any) {
			expect(err.redirect).toBe("/dashboard/provider/messages");
		}
	});

	it("redirects providers from /dashboard to /dashboard/provider", async () => {
		mockRole = "provider";

		vi.mock("@/lib/dashboard/customer-dashboard", () => ({
			getCustomerDashboardData: vi.fn().mockResolvedValue({
				user: { id: "user_1", name: "Tester" },
				upcomingBookings: [],
				pastBookings: [],
				reviewsDue: [],
				favoritesPreview: [],
				recommendations: [],
			}),
		}));

		vi.mock("next/navigation", () => ({
			redirect: (url: string) => {
				const err: any = new Error("REDIRECT");
				err.redirect = url;
				throw err;
			},
		}));

		const { default: DashboardPage } = await import("@/app/dashboard/(customer)/page");

		try {
			await DashboardPage();
			throw new Error("Expected redirect, but function completed normally");
		} catch (err: any) {
			expect(err.redirect).toBe("/dashboard/provider");
		}
	});

	it("redirects admins from /dashboard to /dashboard/admin", async () => {
		mockRole = "admin";

		vi.mock("@/lib/dashboard/customer-dashboard", () => ({
			getCustomerDashboardData: vi.fn().mockResolvedValue({
				user: { id: "admin_1", name: "Admin" },
				upcomingBookings: [],
				pastBookings: [],
				reviewsDue: [],
				favoritesPreview: [],
				recommendations: [],
			}),
		}));

		vi.mock("next/navigation", () => ({
			redirect: (url: string) => {
				const err: any = new Error("REDIRECT");
				err.redirect = url;
				throw err;
			},
		}));

		const { default: DashboardPage } = await import("@/app/dashboard/(customer)/page");

		try {
			await DashboardPage();
			throw new Error("Expected redirect, but function completed normally");
		} catch (err: any) {
			expect(err.redirect).toBe("/dashboard/admin");
		}
	});
});
