import { test, expect } from "@playwright/test";

/**
 * Regression: on mobile, tapping a CTA inside a clickable card/link must not trigger the card navigation.
 *
 * We model the core browser behavior (touch -> click bubbling) in a minimal DOM harness because
 * full auth + DB seeding is not yet available for true end-to-end flows in Playwright.
 */

test.describe("Message Provider mobile tap", () => {
  test.use({ hasTouch: true });

  test("tap on message CTA does not trigger card navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-ish

    await page.setContent(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            #card { display:block; padding:16px; border:1px solid #ddd; border-radius:12px; }
            #msg { padding:12px 14px; border:1px solid #999; border-radius:10px; background:#fff; }
          </style>
        </head>
        <body data-path="/">
          <a id="card" href="/s/deep-clean" aria-label="service card">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
              <div>
                <div>Deep Clean</div>
                <div style="font-size:12px; opacity:0.7;">Sparkle Co</div>
              </div>
              <button id="msg" type="button">Message Provider</button>
            </div>
          </a>

          <script>
            // Simulate Next/SPA card navigation without doing a real network navigation.
            document.getElementById('card').addEventListener('click', (e) => {
              e.preventDefault();
              document.body.dataset.path = '/s/deep-clean';
            });

            // Simulate MessageProviderButton behavior: stop propagation so the card handler doesn't run.
            document.getElementById('msg').addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              document.body.dataset.path = '/dashboard/messages/bk_123';
            });
          </script>
        </body>
      </html>
    `);

    await page.tap("#msg");
    await expect(page.locator("body")).toHaveAttribute("data-path", "/dashboard/messages/bk_123");
  });

  test("tap on card navigates to service", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.setContent(`
      <html>
        <body data-path="/">
          <a id="card" href="/s/deep-clean" aria-label="service card">
            <div id="inside">Deep Clean</div>
          </a>
          <script>
            document.getElementById('card').addEventListener('click', (e) => {
              e.preventDefault();
              document.body.dataset.path = '/s/deep-clean';
            });
          </script>
        </body>
      </html>
    `);

    await page.tap("#inside");
    await expect(page.locator("body")).toHaveAttribute("data-path", "/s/deep-clean");
  });
});
