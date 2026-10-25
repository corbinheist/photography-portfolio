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
    await expect(page.locator('.hero__overline')).toHaveCount(0);
    await expect(page.locator('.sitenav__rail .sitenav__more a[aria-current="page"]')).toHaveText('Lofoten');
    await expect(page.locator('.story-next')).toHaveAttribute('href', '/work/oslo/');
  });

  test('the gallery shows every frame as shot, and a click opens it full bleed', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/gallery/');
    const frames = page.locator('.gallery__frame');
    expect(await frames.count()).toBeGreaterThan(100);
    // No dimming and no caption on the photograph.
    await expect(page.locator('.gallery__frame img').first()).toHaveCSS('opacity', '1');
    await frames.nth(4).locator('.photo-wrap').click();
    const lightbox = page.locator('[data-lightbox]');
    await expect(lightbox).toHaveAttribute('data-frame', '5');
    await page.keyboard.press('ArrowRight');
    await expect(lightbox).toHaveAttribute('data-frame', '6');
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
  });

  test('the homepage starts with the top bar and a full-bleed hero', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-nav', 'bar');
    const box = await page.locator('.hero__media img').boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.width).toBeGreaterThan(1380);
    expect(Math.round(box?.height ?? 0)).toBe(900 - 56);
    await expect(page.locator('.hero__overline')).toHaveText('№ 04');
    // The coordinates run top to bottom in the paper strip beside the photograph.
    const coords = page.locator('.hero__coords');
    await expect(coords).toHaveText('50°55′S 72°24′W');
    await expect(coords).toHaveCSS('writing-mode', 'vertical-rl');
    expect((await coords.boundingBox())?.x).toBeGreaterThanOrEqual((box?.x ?? 0) + (box?.width ?? 0));
  });

  test('the next story is a plate on paper, with its text under it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/nomads/');
    const img = await page.locator('.story-next img').boundingBox();
    const title = await page.locator('.story-next__title').boundingBox();
    expect((title?.y ?? 0)).toBeGreaterThan((img?.y ?? 0) + (img?.height ?? 0));
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

  test('a story starts with the top bar, and the Stories menu marks the story being read', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/ksar/');
    await expect(page.locator('html')).toHaveAttribute('data-nav', 'bar');
    await expect(page.locator('.sitenav__rail')).toBeHidden();
    await page.locator('.sitenav__menu summary').click();
    await expect(page.locator('.sitenav__panel a[aria-current="page"] .sitenav__title')).toHaveText('Ksar Tamnougalt');
  });

  test('rail titles and places fit on one line', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/about/');
    const clipped = await page.$$eval('.sitenav__rail .sitenav__title, .sitenav__rail .sitenav__place, .sitenav__rail .sitenav__more a',
      (els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent?.trim()));
    expect(clipped).toEqual([]);
  });

  test('a visitor who chose the rail keeps it on a story', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('nav', 'rail'));
    await page.goto('/work/ksar/');
    await expect(page.locator('.sitenav__rail')).toBeVisible();
    await expect(page.locator('.sitenav__rail a[aria-current="page"] .sitenav__title')).toHaveText('Ksar Tamnougalt');
  });

  test('the rail minimises into a top bar, remembers it, and expands again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/about/');
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

  test('a story shows its marginalia, frame numbers, and next story', async ({ page }) => {
    await page.goto('/work/nomads/');
    // Each fact once on the first screen: coordinates on the plate edge, place and date in the margin.
    await expect(page.locator('.hero__coords')).toHaveText('31°16′N 5°59′W');
    await expect(page.locator('.hero__margin span')).toHaveText(['Djebel Saghro, Morocco', 'November 2025']);
    await expect(page.locator('.hero__overline')).toHaveText('№ 02');
    await expect(page.locator('.hero__facts')).toHaveCount(0);
    await expect(page.locator('.story-credits')).toContainText('35 frames');
    await expect(page.locator('.hero__chapters')).toHaveCount(0);
    // The title card shows the cover as frame 01, so the body starts at frame 02.
    await expect(page.locator('.hero__media')).toHaveAttribute('data-frame', '1');
    await expect(page.locator('.story-body [data-frame]').first()).toHaveAttribute('data-frame', '2');
    await expect(page.locator('[data-frame]').last()).toHaveAttribute('data-frame', '35');
    await expect(page.locator('.story-next')).toHaveAttribute('href', '/work/ksar/');
    await expect(page.locator('.hero__overline')).toContainText('№ 02');
    await expect(page.locator('.story-next .label')).toHaveText('Next · № 01');
  });

  test('J moves to the next photograph', async ({ page }) => {
    await page.goto('/work/ksar/');
    await page.evaluate(() => document.querySelector('#story-body')?.scrollIntoView());
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });

  test('a click opens a photograph full bleed; nudges and keys move; a click or Escape closes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/nomads/');
    const lightbox = page.locator('[data-lightbox]');
    await page.locator('.story-body [data-frame="3"] .photo-wrap').click();
    await expect(lightbox).toBeVisible();
    await expect(lightbox).toHaveAttribute('data-frame', '3');
    // Only the photograph is on screen: no counter, caption, or button bar.
    await expect(lightbox.locator('img')).toHaveCount(1);
    await expect(page.locator('.lightbox__close')).toHaveCSS('opacity', '0');

    // Each nudge's target is the full height of its side; a click near the top still moves.
    for (const side of ['prev', 'next']) {
      const box = await page.locator(`[data-lightbox-${side}]`).boundingBox();
      expect(box?.y).toBe(0);
      expect(box?.height).toBe(900);
    }
    await page.mouse.click(1430, 20);
    await expect(lightbox).toHaveAttribute('data-frame', '4');
    await page.mouse.click(10, 880);
    await expect(lightbox).toHaveAttribute('data-frame', '3');

    await page.keyboard.press('ArrowRight');
    await expect(lightbox).toHaveAttribute('data-frame', '4');
    await page.keyboard.press('j');
    await expect(lightbox).toHaveAttribute('data-frame', '5');
    await page.keyboard.press('ArrowLeft');
    await expect(lightbox).toHaveAttribute('data-frame', '4');
    // The page behind does not scroll while the view is open.
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('k');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

    // A click on the photograph closes the view.
    await page.mouse.click(720, 450);
    await expect(lightbox).toBeHidden();
    await page.locator('.story-body [data-frame="3"] .photo-wrap').click();
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
  });

  test('the About plates open in the lightbox, and the page has no facts bar or story ledger', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/about/');
    await expect(page.locator('.slug-bar, .ledger-section, .roles-strip')).toHaveCount(0);
    await page.locator('.about-portrait picture').click();
    const lightbox = page.locator('[data-lightbox]');
    await expect(lightbox).toHaveAttribute('data-frame', '1');
    await page.keyboard.press('ArrowRight');
    await expect(lightbox).toHaveAttribute('data-frame', '2');
    await expect(page.locator('[data-lightbox-next]')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
  });

  test('the hero opens as frame 01 with no previous nudge, and Enter opens a focused photograph', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/nomads/');
    await page.locator('.hero__media .photo-wrap').click();
    await expect(page.locator('[data-lightbox]')).toHaveAttribute('data-frame', '1');
    await expect(page.locator('[data-lightbox-prev]')).toBeHidden();
    await expect(page.locator('[data-lightbox-next]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-lightbox]')).toBeHidden();
    await page.locator('.story-body [data-frame="2"] .photo-wrap').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-lightbox]')).toHaveAttribute('data-frame', '2');
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

  for (const route of ['/', '/work/nomads/']) {
    test(`${route} carries one seal: the story number in kiln, or red-300 on ink`, async ({ page }) => {
      await page.goto(route);
      const seal = page.locator('.seal');
      await expect(seal).toHaveCount(1);
      await expect(seal).toContainText('№');
      await expect(seal).toHaveCSS('color', 'rgb(175, 48, 41)');
      await page.evaluate(() => { document.documentElement.dataset.theme = 'ink'; });
      await expect(seal).toHaveCSS('color', 'rgb(232, 112, 95)');
    });
  }

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
