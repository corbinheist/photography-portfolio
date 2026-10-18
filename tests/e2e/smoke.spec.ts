import { test, expect } from '@playwright/test';

const stories = [
  '/work/cold-hands/',
  '/work/bougmez/',
  '/work/nomads/',
  '/work/ksar/',
  '/work/tokyo-kissaten/',
  '/work/lofoten-oslo/',
];

test.describe('smoke tests', () => {
  for (const path of ['/', '/about/', '/gallery/', ...stories]) {
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
    const rail = page.locator('.sitenav__rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.sitenav__stories a')).toHaveCount(stories.length);
    await expect(page.locator('.sitenav__pages--main a[aria-current="page"]')).toHaveText('About');
    for (const [index, path] of stories.entries()) {
      await expect(rail.locator('.sitenav__stories a').nth(index)).toHaveAttribute('href', path);
    }
  });

  test('the gallery shows every frame and links each one to its place in the story', async ({ page }) => {
    await page.goto('/gallery/');
    const frames = page.locator('.gallery__frame');
    expect(await frames.count()).toBeGreaterThan(100);
    // Nomads frame 07 links to its anchor, and the anchor exists on the story page.
    const link = page.locator('.gallery__frame[href="/work/nomads/#frame-07"]');
    await expect(link).toHaveCount(1);
    await link.click();
    await expect(page).toHaveURL(/\/work\/nomads\/#frame-07$/);
    await expect(page.locator('#frame-07')).toHaveAttribute('data-frame', '7');
  });

  test('the gallery keeps the gallery-only frames, without a story link', async ({ page }) => {
    await page.goto('/gallery/');
    const door = page.locator('figure.gallery__frame', { has: page.locator('img[alt^="An open studded wooden door"]') });
    await expect(door).toHaveCount(1);
    await expect(door.locator('figcaption')).toHaveText('Morocco · November 2025');
    await expect(page.locator('figure.gallery__frame img[alt^="Two riders gallop horses"]')).toHaveCount(1);
  });

  test('the navigation links to the gallery', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('.sitenav__pages--main a').first()).toHaveText('Gallery');
  });

  test('the rail highlights the story being read', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/ksar/');
    await expect(page.locator('.sitenav__rail a[aria-current="page"] .sitenav__title')).toHaveText('Ksar Tamnougalt');
  });

  test('the rail minimises into a top bar, remembers it, and expands again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const toggle = page.locator('[data-nav-toggle]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-nav', 'bar');
    await expect(page.locator('.sitenav__rail')).toBeHidden();
    await page.locator('.sitenav__menu summary').click();
    await expect(page.locator('.sitenav__panel .sitenav__stories a')).toHaveCount(stories.length);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-nav', 'bar');
    await expect(page.locator('[data-nav-toggle]')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('[data-nav-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-nav', 'rail');
    await expect(page.locator('.sitenav__rail')).toBeVisible();
  });

  test('on a phone the Stories menu opens the same list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.sitenav__rail')).toBeHidden();
    await expect(page.locator('[data-nav-toggle]')).toBeHidden();
    await page.locator('.sitenav__menu summary').click();
    await expect(page.locator('.sitenav__panel .sitenav__stories a')).toHaveCount(stories.length);
  });

  test('a story shows its facts, chapters, frame counter, and next story', async ({ page }) => {
    await page.goto('/work/nomads/');
    await expect(page.locator('.hero__facts')).toContainText('31°16′N 5°59′W');
    await expect(page.locator('.hero__facts')).toContainText('35');
    await expect(page.locator('.hero__chapters li')).toHaveCount(5);
    // The title card shows the cover as frame 01, so the body starts at frame 02.
    await expect(page.locator('[data-frame]').first()).toHaveAttribute('data-frame', '2');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-story-frame]')).toHaveText('35');
    await expect(page.locator('.story-next')).toHaveAttribute('href', '/work/ksar/');
  });

  test('J moves to the next photograph', async ({ page }) => {
    await page.goto('/work/ksar/');
    await page.evaluate(() => document.querySelector('#story-body')?.scrollIntoView());
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });

  for (const [from, to] of [
    ['/work', /\/$/],
    ['/work/japan', /\/$/],
    ['/work/morocco', /\/$/],
    ['/work/morocco/morocco', /\/$/],
    ['/work/norway/norway-test', /\/work\/lofoten-oslo\/$/],
    ['/work/morocco/nomads-essay', /\/work\/nomads\/$/],
    ['/work/morocco/wise-essay', /\/work\/bougmez\/$/],
    ['/work/japan/tokyo-kissaten', /\/work\/tokyo-kissaten\/$/],
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
