import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const routes = ['/', '/about/', '/gallery/', '/work/nomads/', '/work/tokyo-kissaten/'];

async function audit(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
}

test.describe('accessibility', () => {
  for (const route of routes) {
    for (const theme of ['paper', 'ink'] as const) {
      for (const [device, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
        test(`${route} has no automated WCAG A/AA violations on ${device} in ${theme}`, async ({ page }) => {
          // Set the theme before the first paint, as a stored choice is applied, so no colour transition runs.
          if (theme === 'ink') await page.addInitScript(() => { document.documentElement.dataset.theme = 'ink'; });
          await page.setViewportSize({ width, height });
          await page.goto(route);
          await audit(page);
        });
      }
    }
  }

  for (const theme of ['paper', 'ink'] as const) {
    test(`the open lightbox has no automated WCAG A/AA violations in ${theme}`, async ({ page }) => {
      if (theme === 'ink') await page.addInitScript(() => { document.documentElement.dataset.theme = 'ink'; });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/work/nomads/');
      await page.locator('.story-body [data-frame="3"] .photo-wrap').click();
      await expect(page.locator('[data-lightbox]')).toBeVisible();
      await audit(page);
    });
  }

  test('stories disable snap for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/work/bougmez/');
    await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'none');
  });

  test('stories disable snap in short effective viewports', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/work/bougmez/');
    await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'none');
  });
});
