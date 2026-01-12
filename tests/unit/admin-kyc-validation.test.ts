import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { ProvidersKycQuerySchema, parseQuery } from "@/lib/validation/admin";

describe("admin kyc query validation", () => {
  it("defaults page/pageSize/sort/order", () => {
    const req = new NextRequest("http://localhost/api/admin/providers/kyc");
    const result = parseQuery(ProvidersKycQuerySchema, req);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.page).toBe(1);
    expect(result.data.pageSize).toBe(50);
    expect(result.data.sort).toBe("kyc_status");
    expect(result.data.order).toBe("desc");
  });

  it("parses CSV multi-select filters", () => {
    const req = new NextRequest(
      "http://localhost/api/admin/providers/kyc?kycStatus=verified,pending_review&riskLevel=high,critical&docStatus=any_missing,identity_missing",
    );
    const result = parseQuery(ProvidersKycQuerySchema, req);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.kycStatus).toEqual(["verified", "pending_review"]);
    expect(result.data.riskLevel).toEqual(["high", "critical"]);
    expect(result.data.docStatus).toEqual(["any_missing", "identity_missing"]);
  });

  it("rejects invalid enum values", () => {
    const req = new NextRequest("http://localhost/api/admin/providers/kyc?riskLevel=wat");
    const result = parseQuery(ProvidersKycQuerySchema, req);
    expect(result.ok).toBe(false);
  });

  it("treats empty strings as absent", () => {
    const req = new NextRequest(
      "http://localhost/api/admin/providers/kyc?search=&submittedFrom=&submittedTo=&kycStatus=",
    );
    const result = parseQuery(ProvidersKycQuerySchema, req);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.search).toBeUndefined();
    expect(result.data.submittedFrom).toBeUndefined();
    expect(result.data.submittedTo).toBeUndefined();
    expect(result.data.kycStatus).toBeUndefined();
  });
});
