import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __analyticsEvents: Array<{ name: string; data?: Record<string, string | number> }>;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__analyticsEvents = [];
    Object.defineProperty(window, 'umami', {
      configurable: false,
      value: {
        track(name: string, data?: Record<string, string | number>) {
          window.__analyticsEvents.push({ name, data });
        },
      },
    });
  });
});

test('distinguishes map, list, and filter discovery actions', async ({ page }) => {
  await page.goto('/work');
  await page.locator('.map-marker[data-view="world"]').first().dispatchEvent('click');
  await page.locator('[data-year="2025"]').dispatchEvent('click');
  await page.locator('.dossier-essay').first().dispatchEvent('click');

  await expect.poll(async () => page.evaluate(() => {
    return window.__analyticsEvents.map((event) => event.name);
  })).toEqual(expect.arrayContaining(['map-destination', 'archive-filter', 'list-destination']));
  expect(await page.evaluate(() => {
    return window.__analyticsEvents.find((event) => event.name === 'map-destination')?.data?.destination;
  })).toBe('/work/japan');
});
