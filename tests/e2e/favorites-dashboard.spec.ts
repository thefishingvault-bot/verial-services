import { test, expect } from "@playwright/test";

function appScript() {
  return `
    const services = [
      { id: 'svc_a', title: 'Alpha Clean', base: 10, favorited: false, count: 0 },
      { id: 'svc_b', title: 'Bravo Paint', base: 12, favorited: false, count: 0 },
    ];
    let sort = 'recent';

    function loadState() {
      const raw = localStorage.getItem('fav_state');
      if (!raw) return;
      const state = JSON.parse(raw);
      services.forEach((s) => {
        const saved = state[s.id];
        if (saved) {
          s.favorited = saved.favorited;
          s.count = saved.count;
          s.favoritedAt = saved.favoritedAt ? new Date(saved.favoritedAt) : undefined;
        }
      });
    }

    function saveState() {
      const state = {};
      services.forEach((s) => {
        state[s.id] = { favorited: s.favorited, count: s.count, favoritedAt: s.favoritedAt };
      });
      localStorage.setItem('fav_state', JSON.stringify(state));
    }

    function render() {
      const list = document.getElementById('list');
      const favorites = services.filter((s) => s.favorited);
      favorites.sort((a, b) => {
        if (sort === 'top') {
          const scoreA = a.base + (a.favorited ? 0.75 : 0);
          const scoreB = b.base + (b.favorited ? 0.75 : 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
        }
        const aTime = a.favoritedAt ? new Date(a.favoritedAt).getTime() : 0;
        const bTime = b.favoritedAt ? new Date(b.favoritedAt).getTime() : 0;
        return bTime - aTime;
      });
      list.innerHTML = favorites
        .map(
          (s) => '
            <div class="card" data-id="' + s.id + '">
              <h3>' + s.title + '</h3>
              <button class="heart" aria-label="unfavorite ' + s.title + '" data-id="' + s.id + '">❤</button>
              <span data-count="' + s.id + '">' + s.count + '</span>
            </div>
          ',
        )
        .join('');

      document.querySelectorAll('.heart').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const svc = services.find((s) => s.id === id);
          if (!svc) return;
          svc.favorited = false;
          svc.count = Math.max(0, svc.count - 1);
          saveState();
          render();
        });
      });
    }

    loadState();
    render();

    document.getElementById('fav-a')?.addEventListener('click', () => {
      const svc = services.find((s) => s.id === 'svc_a');
      if (!svc) return;
      svc.favorited = true;
      svc.count += 1;
      svc.favoritedAt = new Date();
      saveState();
      render();
    });

    document.getElementById('fav-b')?.addEventListener('click', () => {
      const svc = services.find((s) => s.id === 'svc_b');
      if (!svc) return;
      svc.favorited = true;
      svc.count += 1;
      svc.favoritedAt = new Date();
      saveState();
      render();
    });

    document.getElementById('sort-top')?.addEventListener('click', () => {
      sort = 'top';
      render();
    });

    document.getElementById('sort-recent')?.addEventListener('click', () => {
      sort = 'recent';
      render();
    });
  `;
}

const pageHtml = `
  <html><body>
    <div class="header">
      <button id="sort-recent">Recent</button>
      <button id="sort-top">Top</button>
    </div>
    <button id="fav-a">Favorite Alpha</button>
    <button id="fav-b">Favorite Bravo</button>
    <div id="list"></div>
    <script>${appScript()}</script>
  </body></html>
`;

test.describe("Favorites dashboard flows", () => {
  test("service appears when favorited and can be removed", async ({ page }) => {
    await page.setContent(pageHtml);
    await page.click('#fav-a');

    await expect(page.locator('.card[data-id="svc_a"]')).toBeVisible();
    await page.getByRole('button', { name: /unfavorite alpha/i }).click();
    await expect(page.locator('.card[data-id="svc_a"]')).toHaveCount(0);
  });

  test("top sort reorders by boosted score", async ({ page }) => {
    await page.setContent(pageHtml);
    await page.click('#fav-a');
    await page.click('#fav-b');

    await page.click('#sort-top');
    const first = page.locator('.card').first();
    await expect(first).toHaveAttribute('data-id', 'svc_b');
  });
});
