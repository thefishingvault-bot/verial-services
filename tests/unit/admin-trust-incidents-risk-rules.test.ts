import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ isAdmin: true, userId: "admin_1" }),
}));

vi.mock("@/lib/user-sync", () => ({
  ensureUserExistsInDb: vi.fn(async () => undefined),
}));

const dbInsertValuesMock = vi.fn(async (vals: any) => {
  inserted.push(vals);
  return undefined;
});

const inserted: any[] = [];

const dbMock = {
  insert: vi.fn(() => ({ values: dbInsertValuesMock })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  select: vi.fn(() => ({
    from: vi.fn((table: any) => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => {
          if (table?.__table === "providers") return [{ id: "prov_1", isSuspended: false }];
          if (table?.__table === "riskRules") {
            return [
              {
                id: "rrule_1",
                name: "Critical Fraud",
                incidentType: "fraud",
                severity: "critical",
                trustScorePenalty: 25,
                autoSuspend: true,
                suspendDurationDays: 7,
                enabled: true,
              },
            ];
          }
          return [];
        }),
      })),
    })),
  })),
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

vi.mock("@/db/schema", () => ({
  providers: { __table: "providers", id: "id", isSuspended: "isSuspended" },
  providerSuspensions: { __table: "providerSuspensions" },
  riskRules: {
    __table: "riskRules",
    enabled: "enabled",
    incidentType: "incidentType",
    severity: "severity",
  },
  trustIncidents: { __table: "trustIncidents" },
}));

beforeEach(() => {
  inserted.length = 0;
  vi.clearAllMocks();
});

describe("risk rules: penalty semantics + incident creation effects", () => {
  it("treats trustScorePenalty as non-negative 'points to deduct' and formats consistently", async () => {
    const { TrustRuleSchema } = await import("@/lib/validation/admin");
    const { formatPenalty, penaltyToTrustScoreImpact } = await import("@/lib/format/penalty");

    expect(TrustRuleSchema.safeParse({ name: "n", incidentType: "fraud", severity: "high", trustScorePenalty: -1 }).success).toBe(false);
    expect(formatPenalty(10)).toBe("Deduct 10");
    expect(penaltyToTrustScoreImpact(10)).toBe(-10);
  });

  it("applies matching enabled risk rule on trust incident creation (impact + auto-suspend)", async () => {
    const { POST } = await import("@/app/api/admin/trust/incidents/create/route");

    const res = await POST(
      new NextRequest("http://localhost/api/admin/trust/incidents/create", {
        method: "POST",
        body: JSON.stringify({
          providerId: "prov_1",
          incidentType: "fraud",
          severity: "critical",
          description: "Test incident",
        }),
      }),
    );

    expect(res.status).toBe(201);

    const incidentInsert = inserted.find((v) => v?.id?.startsWith("tincident_"));
    expect(incidentInsert).toBeTruthy();
    expect(incidentInsert.trustScoreImpact).toBe(-25);

    const suspensionInsert = inserted.find((v) => v?.id?.startsWith("psusp_"));
    expect(suspensionInsert).toBeTruthy();

    expect(dbMock.update).toHaveBeenCalled();
  });
});
