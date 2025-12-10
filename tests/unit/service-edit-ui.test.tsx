// @vitest-environment jsdom

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EditServicePage from "@/app/dashboard/(customer)/services/[serviceId]/edit/page";

// Note: This test only verifies that the edit page renders
// core UX elements without asserting on data loading.

describe("EditServicePage UI", () => {
  it("renders publish toggle and cover image controls", () => {
    // We cannot fully mount Next.js router/fetch behavior here, but we can
    // render the component and assert on static labels.
    render(<EditServicePage /> as any);

    expect(screen.getByText(/Edit Service/i)).toBeInTheDocument();
    expect(screen.getByText(/Publish service/i)).toBeInTheDocument();
    expect(screen.getByText(/Cover Image/i)).toBeInTheDocument();
    expect(screen.getByText(/Change cover image/i)).toBeInTheDocument();
  });
});
