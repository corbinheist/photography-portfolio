import { test, expect } from '@playwright/test';

test.describe('smoke tests — all pages render', () => {
  const pages = [
    { path: '/', title: 'Corbin Heist' },
    { path: '/gallery', heading: 'Gallery' },
    { path: '/work', heading: 'Work' },
    { path: '/about', heading: 'About' },
    { path: '/blog', heading: 'Notes' },
  ];

  for (const { path, title, heading } of pages) {
    test(`${path} returns 200 with expected content`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      if (title) {
        await expect(page).toHaveTitle(new RegExp(title));
      }
      if (heading) {
        await expect(page.locator('h1').first()).toContainText(heading);
      }
    });
  }

  test('nav links are reachable from homepage', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    const links = nav.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
