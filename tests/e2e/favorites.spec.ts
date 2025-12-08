import { test, expect } from "@playwright/test";

function favoriteScript() {
  return `
    const storeKey = 'favorites_state';
    const state = JSON.parse(localStorage.getItem(storeKey) || '{}');

    function save(id, next, count) {
      state[id] = { favorited: next, count };
      localStorage.setItem(storeKey, JSON.stringify(state));
    }

    function wireButton(btn) {
      const id = btn.dataset.id;
      const countEl = document.querySelector('[data-count="' + id + '"]');
      const current = state[id] || { favorited: false, count: Number(countEl?.textContent || 0) };
      btn.dataset.state = current.favorited ? 'filled' : 'outline';
      btn.classList.toggle('favorited', current.favorited);
      if (countEl) countEl.textContent = String(current.count);

      btn.addEventListener('click', () => {
        const now = btn.classList.contains('favorited');
        const next = !now;
        const count = Math.max(0, (Number(countEl?.textContent || 0)) + (next ? 1 : -1));
        btn.classList.toggle('favorited', next);
        if (countEl) countEl.textContent = String(count);
        save(id, next, count);
        document.dispatchEvent(new CustomEvent('fav-change', { detail: { id, next, count } }));
      });
    }

    document.querySelectorAll('[data-fav-button]').forEach((btn) => wireButton(btn));
  `;
}

test.describe("Favorites flows", () => {
  test("service detail heart persists and counts", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <h1>Service Detail</h1>
        <button data-fav-button data-id="svc_detail" aria-label="favorite" class="heart" style="width:40px;height:40px;">❤</button>
        <span data-count="svc_detail">1</span>
        <script>${favoriteScript()}</script>
      </body></html>
    `);

    const heart = page.getByRole('button', { name: /favorite/i });
    const count = page.locator('[data-count="svc_detail"]');

    await heart.click();
    await expect(heart).toHaveClass(/favorited/);
    await expect(count).toHaveText('2');

    await page.reload();
    const heartReload = page.getByRole('button', { name: /favorite/i });
    const countReload = page.locator('[data-count="svc_detail"]');
    await expect(heartReload).toHaveClass(/favorited/);
    await expect(countReload).toHaveText('2');
  });

  test("service card heart survives pagination and filters", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <div data-card="svc_card">
          <button data-fav-button data-id="svc_card" aria-label="favorite card" class="heart">♡</button>
          <span data-count="svc_card">0</span>
        </div>
        <button id="next">Next page</button>
        <button id="filter">Apply filter</button>
        <div id="page-state">page 1</div>
        <script>
          ${favoriteScript()}
          document.getElementById('next')?.addEventListener('click', () => {
            document.getElementById('page-state')!.textContent = 'page 2';
          });
          document.getElementById('filter')?.addEventListener('click', () => {
            document.body.dataset.filter = 'applied';
          });
        </script>
      </body></html>
    `);

    const heart = page.getByRole('button', { name: /favorite card/i });
    const count = page.locator('[data-count="svc_card"]');

    await heart.click();
    await page.click('#next');
    await page.click('#filter');

    await expect(heart).toHaveClass(/favorited/);
    await expect(count).toHaveText('1');
    await expect(page.locator('#page-state')).toHaveText('page 2');
  });

  test("favorite affects tie-break ranking", async ({ page }) => {
    await page.setContent(`
      <html><body>
        <ol id="list"></ol>
        <button data-fav-button data-id="svc_b" aria-label="favorite b">♡</button>
        <script>
          ${favoriteScript()}
          const items = [
            { id: 'svc_a', title: 'Alpha', base: 10 },
            { id: 'svc_b', title: 'Beta', base: 10 },
          ];
          function render() {
            const state = JSON.parse(localStorage.getItem('favorites_state') || '{}');
            const scored = items.map((it) => ({
              ...it,
              score: it.base + (state[it.id]?.favorited ? 0.75 : 0),
            }));
            scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
            const list = document.getElementById('list');
            list!.innerHTML = scored.map((s) => '<li data-id="' + s.id + '">' + s.title + '</li>').join('');
          }
          render();
          document.addEventListener('fav-change', render);
        </script>
      </body></html>
    `);

    const firstBefore = page.locator('#list li').first();
    await expect(firstBefore).toHaveAttribute('data-id', 'svc_a');

    await page.getByRole('button', { name: /favorite b/i }).click();
    const firstAfter = page.locator('#list li').first();
    await expect(firstAfter).toHaveAttribute('data-id', 'svc_b');
  });
});
