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

  test('the desktop rail lists the stories as one flat list and marks the current page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/about/');
    const rail = page.locator('nav.rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.rail__stories a')).toHaveCount(stories.length);
    await expect(rail.locator('.rail__pages a[aria-current="page"]')).toHaveText('About');
    for (const [index, path] of stories.entries()) {
      await expect(rail.locator('.rail__stories a').nth(index)).toHaveAttribute('href', path);
    }
  });

  test('the rail highlights the story being read', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/morocco/ksar-essay/');
    await expect(page.locator('nav.rail a[aria-current="page"] .rail__title')).toHaveText('Ksar Tamnougalt');
  });

  test('on a phone the Stories menu opens the same list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('nav.rail')).toBeHidden();
    await page.locator('.mbar summary').click();
    await expect(page.locator('.mbar__panel .rail__stories a')).toHaveCount(stories.length);
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
