export type DocumentVerificationStatus = {
  identity: "pending" | "verified" | "rejected" | "missing";
  business: "pending" | "verified" | "rejected" | "missing";
  bank: "pending" | "verified" | "rejected" | "missing";
};

export type DocumentStatusFilterKey =
  | "identity_missing"
  | "business_missing"
  | "bank_missing"
  | "any_missing"
  | "any_pending"
  | "all_verified";

export function matchesDocumentStatus(
  status: DocumentVerificationStatus,
  key: DocumentStatusFilterKey,
): boolean {
  switch (key) {
    case "identity_missing":
      return status.identity === "missing";
    case "business_missing":
      return status.business === "missing";
    case "bank_missing":
      return status.bank === "missing";
    case "any_missing":
      return status.identity === "missing" || status.business === "missing" || status.bank === "missing";
    case "any_pending":
      return status.identity === "pending" || status.business === "pending" || status.bank === "pending";
    case "all_verified":
      return status.identity === "verified" && status.business === "verified" && status.bank === "verified";
  }
}

export function matchesDocumentStatusFilters(
  status: DocumentVerificationStatus,
  filters: string[],
): boolean {
  if (!filters.length) return true;
  return filters.some((raw) => {
    const key = raw as DocumentStatusFilterKey;
    return matchesDocumentStatus(status, key);
  });
}
