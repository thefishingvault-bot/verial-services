// @vitest-environment jsdom

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderServicesList } from "@/app/dashboard/provider/services/provider-services-client";

describe("ProviderServicesList", () => {
  it("renders provider services list with heading and service", () => {
    render(
      <ProviderServicesList
        services={[
          {
            id: "svc_1",
            title: "Test Service",
            slug: "test-service",
            priceInCents: 15000,
            category: "cleaning",
            chargesGst: true,
          },
        ]}
        isDeleting={null}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText(/Test Service/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create New/i })).toBeInTheDocument();
  });
});
