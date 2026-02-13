export const JOB_CATEGORIES = [
  "Cleaning",
  "Lawn/Garden",
  "Handyman",
  "Moving",
  "IT Support",
  "Tutoring",
  "Car Detailing",
  "Other",
] as const;

export const JOB_BUDGET_OPTIONS = [
  "Not sure / Get quotes",
  "Under $100",
  "$100-$250",
  "$250-$500",
  "$500+",
] as const;

export const JOB_TIMING_OPTIONS = ["ASAP", "This week", "Next week", "Choose date"] as const;

export type CustomerJobMeta = {
  category: string;
  budget: string;
  timing: string;
  requestedDate: string | null;
};

export type ParsedCustomerJobDescription = CustomerJobMeta & {
  description: string;
};

const META_MARKER = "[verial_job_meta]";

const DEFAULT_META: CustomerJobMeta = {
  category: "Other",
  budget: "Not sure / Get quotes",
  timing: "ASAP",
  requestedDate: null,
};

export function buildCustomerJobDescription(rawDescription: string, meta: Partial<CustomerJobMeta>) {
  const description = rawDescription.trim();
  const normalized: CustomerJobMeta = {
    category: (meta.category || DEFAULT_META.category).trim(),
    budget: (meta.budget || DEFAULT_META.budget).trim(),
    timing: (meta.timing || DEFAULT_META.timing).trim(),
    requestedDate: meta.requestedDate || null,
  };

  return `${description}\n\n${META_MARKER}\n${JSON.stringify(normalized)}`;
}

export function parseCustomerJobDescription(raw: string | null | undefined): ParsedCustomerJobDescription {
  const source = (raw || "").trim();
  const markerIndex = source.lastIndexOf(META_MARKER);
  if (markerIndex === -1) {
    return {
      description: source,
      ...DEFAULT_META,
    };
  }

  const description = source.slice(0, markerIndex).trim();
  const payload = source.slice(markerIndex + META_MARKER.length).trim();

  try {
    const parsed = JSON.parse(payload) as Partial<CustomerJobMeta>;
    return {
      description,
      category: (parsed.category || DEFAULT_META.category).trim(),
      budget: (parsed.budget || DEFAULT_META.budget).trim(),
      timing: (parsed.timing || DEFAULT_META.timing).trim(),
      requestedDate: parsed.requestedDate || null,
    };
  } catch {
    return {
      description,
      ...DEFAULT_META,
    };
  }
}

export type CanonicalJobStatus =
  | "Draft"
  | "Open"
  | "Quoting"
  | "Assigned"
  | "InProgress"
  | "Completed"
  | "Closed"
  | "Cancelled";

export type CanonicalPaymentStatus = "Unpaid" | "DepositPaid" | "Paid" | "Refunded" | "NotRequired";

export function normalizeJobStatus(rawStatus: string, quoteCount = 0): CanonicalJobStatus {
  switch (rawStatus) {
    case "open":
      return quoteCount > 0 ? "Quoting" : "Open";
    case "assigned":
      return "Assigned";
    case "in_progress":
      return "InProgress";
    case "completed":
      return "Completed";
    case "closed":
      return "Closed";
    case "cancelled":
    case "expired":
      return "Cancelled";
    default:
      return "Open";
  }
}

export function normalizePaymentStatus(rawStatus: string | null | undefined, jobStatus: CanonicalJobStatus): CanonicalPaymentStatus {
  switch (rawStatus) {
    case "deposit_paid":
      return "DepositPaid";
    case "fully_paid":
      return "Paid";
    case "refunded":
    case "partially_refunded":
      return "Refunded";
    case "pending":
      return jobStatus === "Assigned" || jobStatus === "InProgress" || jobStatus === "Completed" || jobStatus === "Closed"
        ? "Unpaid"
        : "NotRequired";
    case "failed":
      return "Unpaid";
    default:
      return "NotRequired";
  }
}

export function isPaymentStatusRelevant(status: CanonicalPaymentStatus) {
  return status !== "NotRequired";
}

export function formatCanonicalJobStatus(status: CanonicalJobStatus) {
  if (status === "InProgress") return "In progress";
  return status;
}

export function canEditCustomerJob(status: CanonicalJobStatus) {
  return status === "Draft" || status === "Open" || status === "Quoting";
}

export function canCancelCustomerJob(status: CanonicalJobStatus) {
  return status !== "Completed" && status !== "Closed";
}

export function canReopenCustomerJob(status: CanonicalJobStatus) {
  return status === "Cancelled" || status === "Closed";
}

export function jobStatusFilterBucket(status: CanonicalJobStatus): "open" | "assigned" | "completed" | "closed" | "cancelled" {
  if (status === "Open" || status === "Quoting" || status === "Draft") return "open";
  if (status === "Assigned" || status === "InProgress") return "assigned";
  if (status === "Completed") return "completed";
  if (status === "Closed") return "closed";
  return "cancelled";
}