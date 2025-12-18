import { notFound } from "next/navigation";
import { z } from "zod";

const uuid = () => z.string().uuid();
const providerId = () =>
  z
    .string()
    .min(1)
    .regex(/^prov_[A-Za-z0-9_]+$/, "Invalid provider id");

function parseWithFallback<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw ?? {});
  if (result.success) return result.data;
  return schema.parse({});
}

export function parseParamsOrNotFound<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    notFound();
  }
  return result.data;
}

export function parseSearchParams<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  return parseWithFallback(schema, raw);
}

export const ProviderIdParamSchema = z.object({ providerId: providerId() });
export const BookingIdParamSchema = z.object({ bookingId: uuid() });
export const DisputeIdParamSchema = z.object({ disputeId: uuid() });
export const RuleIdParamSchema = z.object({ ruleId: uuid() });

export const AdminProvidersSearchSchema = z.object({
  q: z.string().trim().optional().default(""),
  status: z.enum(["pending", "approved", "rejected", "all"]).default("all"),
  region: z.string().trim().optional().default("all"),
  stripe: z.enum(["connected", "disconnected", "all"]).default("all"),
  verified: z
    .union([z.literal("1"), z.literal("true"), z.literal("yes"), z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => Boolean(v)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminVerificationsSearchSchema = z.object({
  q: z.string().trim().optional().default(""),
  status: z.enum(["pending", "approved", "rejected", "all"]).default("all"),
  region: z.string().trim().optional().default("all"),
  stripe: z.enum(["connected", "disconnected", "all"]).default("all"),
  verified: z
    .union([z.literal("1"), z.literal("true"), z.literal("yes"), z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => Boolean(v)),
});

export const AdminTrustIncidentsSearchSchema = z.object({
  status: z.enum(["resolved", "unresolved", "all"]).default("all"),
  type: z.string().trim().optional().default("all"),
  severity: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
  search: z.string().trim().optional().default(""),
});

export const AdminDisputesSearchSchema = z.object({
  status: z.enum(["open", "under_review", "resolved", "all"]).default("all"),
  type: z.enum(["customer", "provider", "all"]).default("all"),
  search: z.string().trim().optional().default(""),
  tab: z.enum(["all", "open", "under_review", "resolved"]).default("all"),
});

export const AdminBookingsSearchSchema = z.object({
  status: z
    .enum([
      "all",
      "pending",
      "accepted",
      "paid",
      "completed",
      "canceled",
      "canceled_customer",
      "canceled_provider",
      "confirmed",
    ])
    .default("all")
    .transform((value) => (value === "confirmed" ? "accepted" : value)),
  search: z.string().trim().optional().default(""),
  tab: z.enum(["all", "pending", "confirmed", "paid", "completed", "canceled"]).default("all"),
});

export const AdminBulkSearchSchema = z.object({
  type: z.enum(["providers", "bookings"]).default("providers"),
  status: z.string().trim().optional().default("all"),
  region: z.string().trim().optional().default("all"),
  q: z.string().trim().optional().default(""),
});

export const AdminFeesSearchSchema = z.object({
  range: z.enum(["7d", "30d", "month", "ytd", "all", "custom"]).default("30d"),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  provider: z.string().trim().optional().default(""),
});
