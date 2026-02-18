import { z } from "zod";

export const PROVIDER_CATEGORY_OPTIONS = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "lawn_garden", label: "Lawn & Garden" },
  { value: "cleaning", label: "Cleaning" },
  { value: "handyman", label: "Handyman" },
  { value: "it_tech_support", label: "IT & Tech Support" },
  { value: "web_design", label: "Web & Design" },
  { value: "tutoring", label: "Tutoring" },
  { value: "moving_services", label: "Moving Services" },
  { value: "accounting_bookkeeping", label: "Accounting / Bookkeeping" },
  { value: "other", label: "Other" },
] as const;

export const PROVIDER_CATEGORY_VALUES = PROVIDER_CATEGORY_OPTIONS.map((option) => option.value) as [
  (typeof PROVIDER_CATEGORY_OPTIONS)[number]["value"],
  ...(typeof PROVIDER_CATEGORY_OPTIONS)[number]["value"][],
];

export type ProviderCategory = (typeof PROVIDER_CATEGORY_OPTIONS)[number]["value"];

export const providerCategorySchema = z.enum(PROVIDER_CATEGORY_VALUES);

const providerCategoryValueSet = new Set<string>(PROVIDER_CATEGORY_VALUES);

export const CUSTOMER_JOB_CATEGORY_TO_PROVIDER_CATEGORY: Record<string, ProviderCategory> = {
  Cleaning: "cleaning",
  "Lawn/Garden": "lawn_garden",
  Handyman: "handyman",
  Moving: "moving_services",
  "IT Support": "it_tech_support",
  Tutoring: "tutoring",
  "Car Detailing": "other",
  Other: "other",
};

export function toProviderCategoryOrNull(value: string | null | undefined): ProviderCategory | null {
  if (!value) return null;
  return providerCategoryValueSet.has(value) ? (value as ProviderCategory) : null;
}

export function mapCustomerJobCategoryToProviderCategory(value: string | null | undefined): ProviderCategory | null {
  if (!value) return null;
  return CUSTOMER_JOB_CATEGORY_TO_PROVIDER_CATEGORY[value] ?? null;
}

export const providerCategorySelectionSchema = z
  .object({
    categories: z.array(providerCategorySchema).min(1, "Select at least one category").max(3, "Select up to 3 categories"),
    primaryCategory: providerCategorySchema,
    customCategory: z.string().trim().min(1, "Please specify your service").max(120).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const deduped = Array.from(new Set(data.categories));
    if (deduped.length !== data.categories.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate categories are not allowed",
        path: ["categories"],
      });
    }

    if (!data.categories.includes(data.primaryCategory)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Primary category must be one of the selected categories",
        path: ["primaryCategory"],
      });
    }

    const hasOther = data.categories.includes("other");
    if (hasOther && (!data.customCategory || data.customCategory.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please specify your service",
        path: ["customCategory"],
      });
    }

    if (!hasOther && data.customCategory && data.customCategory.trim().length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom category is only allowed when 'Other' is selected",
        path: ["customCategory"],
      });
    }
  });

export function getProviderCategoryLabel(value: ProviderCategory): string {
  return PROVIDER_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
