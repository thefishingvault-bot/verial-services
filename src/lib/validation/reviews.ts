import { z } from "zod";

export const ReviewCreateSchema = z.object({
  bookingId: z
    .string()
    .min(1)
    .regex(/^bk_\d+_[a-z0-9]+$/i),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || ""),
});

export const ReviewsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const ProviderIdSchema = z.object({
  providerId: z.string().uuid(),
});

export const ServiceIdSchema = z.object({
  serviceId: z.string().uuid(),
});

export async function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request) {
  const json = await req.json().catch(() => null);
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false as const, error: result.error.flatten() };
  }
  return { ok: true as const, data: result.data };
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, req: Request & { nextUrl?: URL }) {
  const url = req.nextUrl ?? new URL(req.url);
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) {
    return { ok: false as const, error: result.error.flatten() };
  }
  return { ok: true as const, data: result.data };
}
