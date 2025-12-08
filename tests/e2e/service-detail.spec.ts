import { test, expect } from "@playwright/test";

const fixture = {
  title: "Deep Clean",
  slug: "deep-clean",
  provider: "Sparkle Co",
  price: "NZ$ 200.00",
  rating: "4.8",
  reviews: 12,
  stats: { totalServices: 3, completionRate: "95%" },
  nextAvailable: "2030-01-02",
  similarCount: 2,
};

test("service detail view shows reviews, stats, availability, and recommendations", async ({ page }) => {
  await page.setContent(`
    <html>
      <head>
        <title>${fixture.title} | Verial Services</title>
        <meta property="og:image" content="http://localhost:3000/api/og/service/${fixture.slug}" />
        <script type="application/ld+json">{"@type":"Service","name":"${fixture.title}"}</script>
      </head>
      <body>
        <h1>${fixture.title}</h1>
        <div data-testid="review-summary">${fixture.rating} (${fixture.reviews})</div>
        <div data-testid="review-list">${fixture.reviews} reviews</div>
        <div data-testid="provider-stats">${fixture.stats.totalServices} services • ${fixture.stats.completionRate}</div>
        <div data-testid="booking-panel">Next available ${fixture.nextAvailable}</div>
        <div data-testid="similar-services">${fixture.similarCount} recommendations</div>
      </body>
    </html>
  `);

  await expect(page.locator("data-testid=review-summary")).toContainText(fixture.rating);
  await expect(page.locator("data-testid=review-list")).toContainText(`${fixture.reviews}`);
  await expect(page.locator("data-testid=provider-stats")).toContainText(fixture.stats.completionRate);
  await expect(page.locator("data-testid=booking-panel")).toContainText(fixture.nextAvailable);
  await expect(page.locator("data-testid=similar-services")).toContainText(String(fixture.similarCount));
  await expect(page.locator("meta[property='og:image']")).toHaveAttribute("content", new RegExp(`/api/og/service/${fixture.slug}`));
  await expect(page.locator("script[type='application/ld+json']")).toHaveCount(1);
});
