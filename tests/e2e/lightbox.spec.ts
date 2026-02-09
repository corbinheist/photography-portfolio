import { test, expect } from '@playwright/test';

test.describe('lightbox — regression guards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gallery');
  });

  test('photo data uses <script type="application/json"> (not <template>)', async ({ page }) => {
    const dataEl = page.locator('script[data-lightbox-data]');
    await expect(dataEl).toHaveCount(1);
    await expect(dataEl).toHaveAttribute('type', 'application/json');

    // Verify the JSON is parseable (not HTML-encoded)
    const raw = await dataEl.textContent();
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('clicking a photo opens lightbox with correct counter', async ({ page }) => {
    const photo = page.locator('[data-lightbox-index]').first();
    await photo.click();

    const lightbox = page.locator('[data-lightbox]');
    await expect(lightbox).toHaveAttribute('aria-hidden', 'false');

    const counter = page.locator('.lightbox-counter');
    await expect(counter).toContainText('1 /');
  });

  test('keyboard navigation works', async ({ page }) => {
    // Open lightbox on first photo
    await page.locator('[data-lightbox-index]').first().click();
    const lightbox = page.locator('[data-lightbox]');
    await expect(lightbox).toHaveAttribute('aria-hidden', 'false');

    // Navigate right
    await page.keyboard.press('ArrowRight');
    const counter = page.locator('.lightbox-counter');
    await expect(counter).toContainText('2 /');

    // Navigate left
    await page.keyboard.press('ArrowLeft');
    await expect(counter).toContainText('1 /');

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveAttribute('aria-hidden', 'true');
  });

  test('lightbox image src uses standard width pattern', async ({ page }) => {
    await page.locator('[data-lightbox-index]').first().click();

    const img = page.locator('[data-lightbox-img]');
    const src = await img.getAttribute('src');
    expect(src).toBeTruthy();
    // Should end with a standard width like -2400.webp, -1600.webp, etc.
    expect(src).toMatch(/-\d+\.webp$/);
    const widthMatch = src!.match(/-(\d+)\.webp$/);
    const width = parseInt(widthMatch![1], 10);
    expect([640, 750, 1080, 1600, 2400]).toContain(width);
  });
});
