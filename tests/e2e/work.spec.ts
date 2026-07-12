import { test, expect } from '@playwright/test';

test.describe('work interactions', () => {
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
