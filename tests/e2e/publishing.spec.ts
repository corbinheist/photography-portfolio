import { expect, test } from '@playwright/test';

test.describe('publishing controls', () => {
  test('internal examples and pitches are noindexed', async ({ page }) => {
    for (const route of ['/essays/example', '/pitch/brand']) {
      await page.goto(route);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    }
  });

  test('sitemap contains public work and excludes internal routes', async ({ request }) => {
    const index = await request.get('/sitemap-index.xml');
    expect(index.ok()).toBe(true);
    const indexXml = await index.text();
    const sitemapPath = new URL(indexXml.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '').pathname;
    const sitemap = await request.get(sitemapPath);
    expect(sitemap.ok()).toBe(true);
    const xml = await sitemap.text();
    expect(xml).toContain('https://heist.studio/work/morocco/');
    expect(xml).not.toContain('/pitch/');
    expect(xml).not.toContain('/essays/example/');
  });

  test('robots metadata points at the production sitemap', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('Sitemap: https://heist.studio/sitemap-index.xml');
  });
});
