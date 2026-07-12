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

  test('essays expose canonical sharing and structured metadata', async ({ page }) => {
    await page.goto('/work/morocco/wise-essay');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://heist.studio/work/morocco/wise-essay/',
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\/.*-1600\.webp$/);

    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}');
    const types = data['@graph'].map((entry: { '@type': string }) => entry['@type']);
    expect(types).toEqual(expect.arrayContaining(['Person', 'BreadcrumbList', 'ImageObject', 'CreativeWork']));
    const creativeWork = data['@graph'].find((entry: { '@type': string }) => entry['@type'] === 'CreativeWork');
    expect(creativeWork.contentLocation.name).toBe('Aït Bougmez, Morocco');
  });

  test('noindexed pages omit structured metadata', async ({ page }) => {
    await page.goto('/essays/example');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });
});
