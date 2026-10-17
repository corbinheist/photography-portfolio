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
      await expect(page.locator(`.ledger a[href="${path}"]`)).toHaveCount(1);
    }
  });

  test('the header has numbered Work, About, Journal, and Contact links', async ({ page }) => {
    await page.goto('/about/');
    const links = page.locator('.site-header nav a');
    await expect(links).toHaveText([/01\s*Work/, /02\s*About/, /03\s*Journal/, 'Contact']);
    await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
  });

  test('a story shows its facts, chapters, frame counter, and next story', async ({ page }) => {
    await page.goto('/work/morocco/nomads-essay/');
    await expect(page.locator('.hero__facts')).toContainText('31°16′N 5°59′W');
    await expect(page.locator('.hero__facts')).toContainText('35');
    await expect(page.locator('.hero__chapters li')).toHaveCount(5);
    await expect(page.locator('[data-frame]').first()).toHaveAttribute('data-frame', '1');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-story-frame]')).toHaveText('35');
    await expect(page.locator('.story-next')).toHaveAttribute('href', '/work/morocco/ksar-essay/');
  });

  test('J moves to the next photograph', async ({ page }) => {
    await page.goto('/work/morocco/ksar-essay/');
    await page.evaluate(() => document.querySelector('#story-body')?.scrollIntoView());
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
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

  test('the site is dark by default, whatever the system setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
