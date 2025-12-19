import { NextResponse } from "next/server";
import { z } from "zod";

const uuid = () => z.string().uuid();
const providerId = () =>
  z
    .string()
    .min(1)
    .regex(/^prov_[A-Za-z0-9_]+$/, "Invalid provider id");

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const ProviderIdSchema = z.object({ providerId: providerId() });
export const UserIdSchema = z.object({ userId: uuid() });
export const BookingIdSchema = z.object({ bookingId: uuid() });
export const DisputeIdSchema = z.object({ disputeId: uuid() });
export const RuleIdSchema = z.object({ ruleId: z.string().min(1) });

export const TrustRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  incidentType: z.string().trim().min(1).max(100),
  severity: z.enum(["low", "medium", "high", "critical"]),
  trustScorePenalty: z.coerce.number().int().nonnegative().default(0),
  autoSuspend: z.coerce.boolean().default(false),
  suspendDurationDays: z
    .union([z.coerce.number().int().nonnegative(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
});

export const VerifyProviderSchema = z.object({
  providerId: providerId(),
  newStatus: z.enum(["pending", "approved", "rejected"]),
});

export const ProviderVerificationSchema = z.object({
  isVerified: z.boolean(),
});

export const ProviderBanSchema = z.object({
  reason: z.string().trim().optional().transform((v) => v || "Banned by admin"),
});

export const ProviderSuspensionSchema = z.object({
  reason: z.string().trim().min(1),
  startDate: z.coerce.date(),
  endDate: z
    .union([z.coerce.date(), z.string().length(0), z.null()])
    .optional()
    .transform((v) => (v instanceof Date ? v : null)),
}).superRefine((data, ctx) => {
  if (data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be on or after the start date",
    });
  }
});

export const DisputeResolveSchema = z.object({
  decision: z.string().trim().min(1),
  refundAmount: z
    .union([z.coerce.number().int().nonnegative(), z.string().length(0), z.null()])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  adminNotes: z.string().trim().min(1),
});

export const RefundCreateSchema = z.object({
  bookingId: uuid(),
  amount: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1),
  description: z.string().trim().optional().transform((v) => v || null),
});

export const RefundQuerySchema = z.object({
  bookingId: uuid(),
});

export const FeesReportQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const FeesByProviderQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  format: z.enum(["csv"]).optional(),
});

export const BroadcastQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const BroadcastCreateSchema = z.object({
  message: z.string().trim().min(1),
  href: z.string().trim().optional().transform((v) => v || undefined),
  targetRoles: z.array(z.string()).optional(),
  targetUsers: z.array(z.string()).optional(),
});

export const TemplatesQuerySchema = z.object({
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export const ProvidersKycQuerySchema = z.object({
  sort: z
    .enum(["kyc_status", "risk_score", "created", "business_name"])
    .optional()
    .transform((v) => v ?? "kyc_status"),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .transform((v) => v ?? "desc"),
});

export const TemplateCreateSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  content: z.string().trim().min(1),
  variables: z.array(z.string()).optional().transform((v) => v || []),
});

export const TemplateUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().optional(),
  category: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  content: z.string().trim().optional(),
  variables: z.array(z.string()).optional(),
});

export const TemplateDeleteSchema = z.object({
  id: z.string().min(1),
});

export function invalidResponse(details: unknown) {
  return NextResponse.json({ error: "Invalid request", details }, { status: 400 });
}

export async function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request) {
  const json = await req.json().catch(() => null);
  const result = schema.safeParse(json);
  if (!result.success) return { ok: false as const, error: result.error.flatten() };
  return { ok: true as const, data: result.data };
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, req: Request & { nextUrl?: URL }) {
  const url = req.nextUrl ?? new URL(req.url);
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) return { ok: false as const, error: result.error.flatten() };
  return { ok: true as const, data: result.data };
}

export function parseParams<T extends z.ZodTypeAny>(schema: T, params: unknown) {
  const result = schema.safeParse(params);
  if (!result.success) return { ok: false as const, error: result.error.flatten() };
  return { ok: true as const, data: result.data };
}

export async function parseForm<T extends z.ZodTypeAny>(schema: T, req: Request) {
  const formData = await req.formData().catch(() => null);
  if (!formData) return { ok: false as const, error: { formErrors: ["Invalid form data"], fieldErrors: {} } };
  const obj: Record<string, FormDataEntryValue> = {};
  formData.forEach((value, key) => {
    obj[key] = value;
  });
  const result = schema.safeParse(obj);
  if (!result.success) return { ok: false as const, error: result.error.flatten() };
  return { ok: true as const, data: result.data };
}
