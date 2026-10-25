import { test, expect } from '@playwright/test';

// Featured stories, newest first: the hero, the numbered index, and the rail's main list.
const stories = [
  '/work/cold-hands/',
  '/work/bougmez/',
  '/work/nomads/',
  '/work/ksar/',
];

// The other stories, newest first: "More stories".
const moreStories = [
  '/work/tokyo-kissaten/',
  '/work/lofoten/',
  '/work/oslo/',
];

test.describe('smoke tests', () => {
  for (const path of ['/', '/about/', '/gallery/', ...stories, ...moreStories]) {
    test(`${path} returns 200 and renders main`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('main')).toBeAttached();
    });
  }

  test('the homepage call to action names the lead story place', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('.hero__cta');
    await expect(cta).toHaveText(/^Go to Cerro Guido/);
    await expect(cta).toHaveAttribute('href', '/work/cold-hands/');
    await expect(cta).toHaveAccessibleName('Go to Cerro Guido: Cold Hands');
  });

  test('the homepage lists every published story', async ({ page }) => {
    await page.goto('/');
    for (const [index, path] of stories.entries()) {
      await expect(page.locator(`.ledger a[href="${path}"]`)).toHaveCount(1);
      // Numbered from the oldest: the newest (first) story has the highest number.
      await expect(page.locator('.ledger__num').nth(index)).toHaveText(`№ ${String(stories.length - index).padStart(2, '0')}`);
    }
    for (const [index, path] of moreStories.entries()) {
      await expect(page.locator(`.ledger a[href="${path}"]`)).toHaveCount(0);
      await expect(page.locator('.more__card').nth(index)).toHaveAttribute('href', path);
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
    for (const [index, path] of moreStories.entries()) {
      await expect(rail.locator('.sitenav__more a').nth(index)).toHaveAttribute('href', path);
    }
  });

  test('a story that is not featured has no number and links within its own tier', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/lofoten/');
    await expect(page.locator('.hero__overline')).not.toContainText('№');
    await expect(page.locator('.sitenav__rail .sitenav__more a[aria-current="page"]')).toHaveText('Lofoten');
    await expect(page.locator('.story-next')).toHaveAttribute('href', '/work/oslo/');
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

  test('photographs show a blurred placeholder until they load, then drop it', async ({ page }) => {
    await page.goto('/gallery/');
    const first = page.locator('.photo-img').first();
    // Every photograph carries an inline SVG blur placeholder.
    expect(await page.locator('.photo-img[style*="--placeholder: url(\'data:image/svg+xml"]').count()).toBe(await page.locator('.photo-img').count());
    await expect(first).toHaveAttribute('data-loaded', '');
    expect(await first.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
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
    // Labels are spelled out, never abbreviated.
    await expect(page.locator('.hero__facts dt')).toContainText(['Place', 'Region', 'Coordinates', 'Date', 'Frames']);
    await expect(page.locator('.hero__facts')).not.toContainText('Coords');
    await expect(page.locator('.hero__chapters li')).toHaveCount(5);
    // The title card shows the cover as frame 01, so the body starts at frame 02.
    await expect(page.locator('[data-frame]').first()).toHaveAttribute('data-frame', '2');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-story-frame]')).toHaveText('35');
    await expect(page.locator('.story-next')).toHaveAttribute('href', '/work/ksar/');
    await expect(page.locator('.hero__overline')).toContainText('№ 02');
    await expect(page.locator('.story-next .mono-label')).toHaveText('Next · № 01');
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
    ['/work/norway/norway-test', /\/work\/lofoten\/$/],
    ['/work/lofoten-oslo', /\/work\/lofoten\/$/],
    ['/work/morocco/nomads-essay', /\/work\/nomads\/$/],
    ['/work/morocco/wise-essay', /\/work\/bougmez\/$/],
    ['/work/japan/tokyo-kissaten', /\/work\/tokyo-kissaten\/$/],
  ] as const) {
    test(`${from} redirects`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    });
  }

  test('paper is the default whatever the system setting, and ink is opt-in', async ({ page }) => {
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/about/');
    expect(await background()).toBe('rgb(255, 252, 240)');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'ink'; });
    await expect.poll(background).toBe('rgb(16, 15, 15)');
  });

  test('the theme toggle remembers ink across a reload and a navigation', async ({ page }) => {
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'paper');
    const toggle = page.locator('[data-theme-toggle]:visible').first();
    await page.goto('/about/');
    await expect(toggle).toHaveText('Ink');
    await toggle.click();
    expect(await theme()).toBe('ink');
    await page.reload();
    expect(await theme()).toBe('ink');
    await page.goto('/work/nomads/');
    expect(await theme()).toBe('ink');
    await expect(toggle).toHaveText('Paper');
    await toggle.click();
    expect(await theme()).toBe('paper');
  });
});
