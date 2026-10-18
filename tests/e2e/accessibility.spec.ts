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
    for (const colorScheme of ['dark', 'light'] as const) {
      for (const [device, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
        test(`${route} has no automated WCAG A/AA violations on ${device} in ${colorScheme}`, async ({ page }) => {
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize({ width, height });
          await page.goto(route);
          await audit(page);
        });
      }
    }
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
