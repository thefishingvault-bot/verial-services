import { describe, expect, it } from "vitest";
import { parseSearchParams, AdminBookingsSearchSchema } from "@/lib/validation/admin-loader-schemas";
import { computeBookingsListControls } from "@/lib/admin/bookings-list-controls";

describe("admin bookings pagination + sorting controls", () => {
  it("defaults to createdAt desc with page 1, pageSize 25", () => {
    const params = parseSearchParams(AdminBookingsSearchSchema, {});

    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(25);
    expect(params.sortBy).toBe("createdAt");
    expect(params.sortDir).toBe("desc");

    const controls = computeBookingsListControls(params);
    expect(controls.limit).toBe(25);
    expect(controls.offset).toBe(0);
    expect(controls.sortBy).toBe("createdAt");
    expect(controls.sortDir).toBe("desc");
  });

  it("applies limit/offset and sort direction from params", () => {
    const params = parseSearchParams(AdminBookingsSearchSchema, {
      page: "2",
      pageSize: "10",
      sortBy: "amount",
      sortDir: "asc",
    });

    const controls = computeBookingsListControls(params);

    expect(controls.limit).toBe(10);
    expect(controls.offset).toBe(10);
    expect(controls.sortBy).toBe("amount");
    expect(controls.sortDir).toBe("asc");
  });
});
