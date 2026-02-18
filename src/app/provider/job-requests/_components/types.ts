import type { CanonicalJobStatus } from "@/lib/customer-job-meta";

export type ProviderQuoteState = "none" | "submitted" | "accepted" | "rejected";

export type ProviderFeedPhoto = {
  url: string;
  sortOrder: number;
};

export type ProviderFeedJob = {
  id: string;
  title: string;
  description: string;
  suburb: string | null;
  region: string | null;
  createdAt: string;
  category: string;
  categoryDisplay: string;
  categoryId: string | null;
  budget: string;
  timing: string;
  jobStatus: CanonicalJobStatus;
  quoteState: ProviderQuoteState;
  photos: ProviderFeedPhoto[];
};

export type ProviderFeedFilter = "all" | "open" | "assigned" | "completed" | "saved";
export type ProviderFeedSort = "newest" | "oldest";
