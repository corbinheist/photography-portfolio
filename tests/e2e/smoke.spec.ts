import { test, expect } from '@playwright/test';

const stories = [
  '/work/morocco/nomads-essay/',
  '/work/morocco/ksar-essay/',
  '/work/morocco/wise-essay/',
  '/work/morocco/morocco/',
  '/work/japan/tokyo-kissaten/',
  '/work/lofoten-oslo/',
];

test.describe('smoke tests', () => {
  for (const path of ['/', '/about/', ...stories]) {
    test(`${path} returns 200 and renders main`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('main')).toBeAttached();
    });
  }

  test('the homepage lists every published story', async ({ page }) => {
    await page.goto('/');
    for (const path of stories) {
      await expect(page.locator(`.home-stories a[href="${path}"]`)).toHaveCount(1);
    }
  });

  test('the header has Work, About, and Journal', async ({ page }) => {
    await page.goto('/about/');
    const links = page.locator('.site-header nav a');
    await expect(links).toHaveText(['Work', 'About', 'Journal']);
    await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
  });

  for (const [from, to] of [
    ['/work', /\/$/],
    ['/work/morocco', /\/$/],
    ['/gallery', /\/$/],
    ['/work/norway/norway-test', /\/work\/lofoten-oslo\/$/],
  ] as const) {
    test(`${from} redirects`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    });
  }

  test('the theme follows the system colour scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
