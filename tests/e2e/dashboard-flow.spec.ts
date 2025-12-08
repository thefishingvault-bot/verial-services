import { test, expect } from "@playwright/test";

const pageHtml = `
  <html><body>
    <header><h1>Dashboard</h1></header>
    <section id="upcoming">
      <div class="booking" data-id="bk1">
        <span class="title">Clean</span>
        <button class="complete" data-id="bk1">Mark complete</button>
      </div>
    </section>
    <section id="past"></section>
    <section id="review-reminders"></section>
    <section id="favorites">
      <a class="fav-link" href="/dashboard/favorites">View all favorites</a>
      <div class="fav-grid"></div>
    </section>
    <section id="recs">
      <a class="rec" data-id="svc_rec" href="/s/rec">Recommended</a>
    </section>
    <script>
      const state = {
        upcoming: [{ id: 'bk1', title: 'Clean' }],
        past: [],
        reminders: [],
        favorites: [],
      };
      document.querySelectorAll('.complete').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const node = document.querySelector('#upcoming .booking[data-id="' + id + '"]');
          if (node) {
            node.remove();
            const past = document.querySelector('#past');
            const div = document.createElement('div');
            div.className = 'booking';
            div.dataset.id = id;
            const title = node.querySelector('.title')?.textContent || '';
            div.innerHTML = '<span class="title">' + title + '</span><a class="review" href="#" data-id="' + id + '">Review Now</a>';
            past.appendChild(div);
            // also add to reminders
            const reminder = document.createElement('div');
            reminder.className = 'reminder';
            reminder.dataset.id = id;
            reminder.innerHTML = '<span>Review ' + id + '</span>';
            document.querySelector('#review-reminders').appendChild(reminder);
          }
        });
      });
      document.addEventListener('click', (e) => {
        const link = e.target.closest('.review');
        if (!link) return;
        e.preventDefault();
        const id = link.dataset.id;
        const node = document.querySelector('#past .booking[data-id="' + id + '"]');
        if (node) node.remove();
        const reminder = document.querySelector('#review-reminders .reminder[data-id="' + id + '"]');
        if (reminder) reminder.remove();
      });

      // favorites toggle add/remove
      function renderFavorites() {
        const grid = document.querySelector('.fav-grid');
        grid.innerHTML = '';
        state.favorites.forEach((fav) => {
          const card = document.createElement('div');
          card.className = 'fav-card';
          card.dataset.id = fav.id;
          card.innerHTML = '<span>' + fav.title + '</span><button class="unfav" data-id="' + fav.id + '">Unfavorite</button>';
          grid.appendChild(card);
        });
      }

      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.unfav');
        if (!btn) return;
        const id = btn.dataset.id;
        state.favorites = state.favorites.filter(f => f.id !== id);
        renderFavorites();
      });

      window.testActions = {
        addBooking(id, title) {
          const upcoming = document.querySelector('#upcoming');
          const div = document.createElement('div');
          div.className = 'booking';
          div.dataset.id = id;
          div.innerHTML = '<span class="title">' + title + '</span><button class="complete" data-id="' + id + '">Mark complete</button>';
          upcoming.appendChild(div);
        },
        addFavorite(id, title) {
          state.favorites.push({ id, title });
          renderFavorites();
        },
      };
    </script>
  </body></html>
`;

test.describe("Customer dashboard flows", () => {
  test("booking completion moves to past", async ({ page }) => {
    await page.setContent(pageHtml);
    await page.getByRole('button', { name: /Mark complete/i }).click();
    await expect(page.locator('#upcoming .booking')).toHaveCount(0);
    await expect(page.locator('#past .booking')).toHaveCount(1);
  });

  test("review reminder disappears after review", async ({ page }) => {
    await page.setContent(pageHtml);
    await page.getByRole('button', { name: /Mark complete/i }).click();
    await page.getByRole('link', { name: /Review Now/i }).click();
    await expect(page.locator('#review-reminders .reminder')).toHaveCount(0);
  });

  test("favorite add/remove updates preview", async ({ page }) => {
    await page.setContent(pageHtml);
    await page.evaluate(() => window.testActions.addFavorite('svc1', 'Service One'));
    await expect(page.locator('.fav-card')).toHaveCount(1);
    await page.getByRole('button', { name: /Unfavorite/i }).click();
    await expect(page.locator('.fav-card')).toHaveCount(0);
  });

  test("recommendations link remains clickable", async ({ page }) => {
    await page.setContent(pageHtml);
    await expect(page.getByRole('link', { name: /Recommended/i })).toHaveAttribute('href', '/s/rec');
  });
});

declare global {
  interface Window {
    testActions: {
      addBooking: (id: string, title: string) => void;
      addFavorite: (id: string, title: string) => void;
    };
  }
}

export {};
