import { test, expect } from '@playwright/test';

test.describe('theme toggle', () => {
  test('toggle changes data-theme attribute', async ({ page }) => {
    await page.goto('/');

    const initialTheme = await page.locator('html').getAttribute('data-theme');
    const toggleBtn = page.locator('[data-theme-toggle]').first();
    await toggleBtn.click();

    const newTheme = await page.locator('html').getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
    expect(['dark', 'light']).toContain(newTheme);
  });

  test('theme persists across navigation', async ({ page }) => {
    await page.goto('/');

    // Toggle to light
    const toggleBtn = page.locator('[data-theme-toggle]').first();
    await toggleBtn.click();
    const theme = await page.locator('html').getAttribute('data-theme');

    // Navigate to another page
    await page.goto('/about');
    const aboutTheme = await page.locator('html').getAttribute('data-theme');
    expect(aboutTheme).toBe(theme);
  });

  test('theme persists after reload via localStorage', async ({ page }) => {
    await page.goto('/');

    // Toggle to light
    const toggleBtn = page.locator('[data-theme-toggle]').first();
    await toggleBtn.click();
    const theme = await page.locator('html').getAttribute('data-theme');

    // Reload
    await page.reload();
    const reloadedTheme = await page.locator('html').getAttribute('data-theme');
    expect(reloadedTheme).toBe(theme);
  });
});
