import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/',
  '/gallery',
  '/work',
  '/work/morocco',
  '/work/morocco/wise-essay',
  '/about',
  '/blog',
];

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
  for (const theme of ['dark', 'light'] as const) {
    for (const route of routes) {
      test(`${route} has no automated WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
        await page.addInitScript((selectedTheme) => localStorage.setItem('theme', selectedTheme), theme);
        await page.goto(route);
        await audit(page);
      });
    }
  }

  test('mobile Work interactions have no automated WCAG A/AA violations', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/work');
    await audit(page);
  });

  test('open command palette has no automated WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('/');
    await expect(page.locator('[data-cmd]')).toHaveAttribute('aria-hidden', 'false');
    await audit(page);
  });

  test('open mobile navigation has no automated WCAG A/AA violations', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.locator('[data-menu-toggle]').click();
    await expect(page.locator('[data-nav-dropdown]')).toHaveAttribute('aria-hidden', 'false');
    await audit(page);
  });

  test('open lightbox has no automated WCAG A/AA violations', async ({ page }) => {
    await page.goto('/gallery');
    await page.locator('[data-lightbox-index="0"]').click();
    await expect(page.locator('[data-lightbox]')).toHaveAttribute('aria-hidden', 'false');
    await audit(page);
    await page.locator('[data-lightbox-close]').click();
    await expect(page.locator('[data-lightbox]')).toHaveAttribute('inert', '');
    await expect(page.locator('[data-cmd]')).toHaveAttribute('inert', '');
    await expect(page.locator('[data-subscribe-banner]')).toHaveAttribute('inert', '');
  });

  test('command palette restores focus after client navigation', async ({ page }) => {
    await page.goto('/about');
    await page.locator('[data-side-rail] a[href="/gallery"]').click();
    await expect(page).toHaveURL(/\/gallery\/?$/);
    const trigger = page.locator('[data-side-rail] [data-command-palette-trigger]');
    await trigger.click();
    await expect(page.locator('[data-cmd-input]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.locator('[data-cmd]')).toHaveAttribute('inert', '');
  });

  test('mobile Work accordion synchronizes state and focusability', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.locator('[data-menu-toggle]').click();
    const accordion = page.locator('[data-nav-accordion]');
    const panel = page.locator('[data-nav-accordion-panel]');
    await accordion.click();
    await expect(accordion).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).not.toHaveAttribute('inert', '');
    await accordion.click();
    await expect(accordion).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toHaveAttribute('inert', '');
  });

  test('subscribe timer does not leak across client navigation', async ({ page }) => {
    await page.clock.install();
    await page.goto('/about');
    await page.locator('[data-side-rail] a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.clock.fastForward(8_000);
    await expect(page.locator('[data-subscribe-banner]')).toHaveAttribute('aria-hidden', 'true');
  });

  test('essays disable snap and clipping for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/work/morocco/wise-essay');
    await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'none');
    await expect(page.locator('.essay-slide').first()).toHaveCSS('overflow', 'visible');
  });

  test('essays disable snap and clipping in short effective viewports', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/work/morocco/wise-essay');
    await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'none');
    await expect(page.locator('.essay-slide').first()).toHaveCSS('overflow', 'visible');
  });
});
