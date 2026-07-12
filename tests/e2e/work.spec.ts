import { test, expect } from '@playwright/test';

test.describe('work interactions', () => {
  test('map runtime loads only when client navigation reaches a map route', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('[data-persistent-map]')).toHaveCount(0);

    const aboutHtml = await (await page.request.get('/about')).text();
    expect(aboutHtml).not.toContain('Map.astro_astro_type_script');
    expect(aboutHtml).not.toContain('PersistentMap.astro_astro_type_script');

    await page.locator('a[href="/work"]').first().click();
    await expect(page).toHaveURL(/\/work\/?$/);
    await expect(page.locator('[data-persistent-map]')).toBeAttached();
    await expect(page.locator('.map-marker[data-view="world"]').first()).toBeAttached({ timeout: 15_000 });

    await page.locator('[data-map]').evaluate((container: any) => {
      container.__map.__persistenceTest = 'same-instance';
    });
    await page.locator('a[href="/work/morocco"]').last().dispatchEvent('click');
    await expect(page).toHaveURL(/\/work\/morocco\/?$/);
    expect(await page.locator('[data-map]').evaluate((container: any) => {
      return container.__map.__persistenceTest;
    })).toBe('same-instance');

    await page.locator('[data-side-rail] a[href="/gallery"]').click();
    await expect(page).toHaveURL(/\/gallery\/?$/);
    await expect(page.locator('[data-persistent-map]')).toHaveCount(0);
  });

  test('deferred animation runtime reveals initial content', async ({ page }) => {
    await page.goto('/gallery');
    await expect(page.locator('.gallery-header')).not.toHaveCSS('opacity', '0');
    await expect.poll(async () => {
      return (await page.locator('html').getAttribute('class'))?.includes('lenis') ?? false;
    }).toBe(true);

    await page.locator('a[href="/work/morocco/wise-essay"]').first().dispatchEvent('click');
    await expect(page).toHaveURL(/\/work\/morocco\/wise-essay\/?$/);
    await expect.poll(async () => {
      return (await page.locator('html').getAttribute('class'))?.includes('lenis') ?? false;
    }).toBe(false);
  });

  test('homepage prioritizes and preloads only the first hero', async ({ page }) => {
    await page.goto('/');
    const heroImages = page.locator('[data-hero-briefing] .hero__slide img');
    await expect(heroImages.first()).toHaveAttribute('fetchpriority', 'high');
    await expect(heroImages.nth(1)).toHaveAttribute('fetchpriority', 'low');
    await expect(page.locator('link[rel="preload"][as="image"][fetchpriority="high"]')).toHaveCount(1);
  });

  test('year filtering only changes world markers', async ({ page }) => {
    await page.goto('/work');

    const yearTab = page.locator('.work-year-tab:not([data-year="all"])').first();
    const year = await yearTab.getAttribute('data-year');
    const matching = page.locator(`.dossier-collection[data-story-year="${year}"]`).first();
    const other = page.locator(`.dossier-collection:not([data-story-year="${year}"])`).first();
    const matchingNum = await matching.getAttribute('data-story-marker');
    const otherNum = await other.getAttribute('data-story-marker');

    await page.locator('[data-map]').evaluate((container, nums) => {
      const markers: Array<[string, string | null, string]> = [
        ['world', nums.matchingNum, 'matching-world'],
        ['world', nums.otherNum, 'other-world'],
        ['region', 'test-region-01', 'region-marker'],
      ];
      for (const [view, num, id] of markers) {
        const marker = document.createElement('div');
        marker.id = id;
        marker.className = 'map-marker--label-only';
        marker.dataset.view = view;
        marker.dataset.markerNum = num ?? '';
        container.append(marker);
      }
    }, { matchingNum, otherNum });

    await yearTab.click();
    await expect(page.locator('#matching-world')).not.toHaveCSS('display', 'none');
    await expect(page.locator('#other-world')).toHaveCSS('display', 'none');
    await expect(page.locator('#region-marker')).not.toHaveCSS('display', 'none');
  });

  test('mobile region sheet traps focus, closes with Escape, and restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/work');

    const returnTarget = page.locator('.header-right [data-theme-toggle]');
    await returnTarget.focus();

    const marker = page.locator(
      '[data-persistent-map] .map-marker[data-view="world"]:not(.map-marker--inactive)',
    ).first();
    await expect(marker).toBeAttached({ timeout: 15_000 });
    await marker.dispatchEvent('click');

    const sheet = page.getByRole('dialog', { name: /.+/ });
    const close = page.locator('[data-story-sheet-close]');
    await expect(sheet).toBeVisible();
    await close.focus();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(returnTarget).toBeFocused();
  });

  for (const route of [
    '/work/morocco',
    '/work/morocco/wise-essay',
    '/work/morocco/morocco',
    '/work/patagonia/briefing',
  ]) {
    test(`${route} is generated and renders`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('main')).toBeAttached();
    });
  }
});
