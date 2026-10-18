import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://heist.studio',
  redirects: {
    // Stories are flat: one story, one URL at /work/<slug>/. The old essay and album URLs redirect.
    '/work/morocco/nomads-essay': '/work/nomads/',
    '/work/morocco/ksar-essay': '/work/ksar/',
    '/work/morocco/wise-essay': '/work/bougmez/',
    '/work/morocco/morocco': '/work/morocco/',
    '/work/japan/tokyo-kissaten': '/work/tokyo-kissaten/',
    '/work/norway/norway-test': '/work/lofoten-oslo/',
    '/work/patagonia/briefing': '/',
    // The region index, the region pages, the gallery, and the blog were removed.
    '/work': '/',
    '/work/france': '/',
    '/work/italy': '/',
    '/work/japan': '/',
    '/work/montana': '/',
    '/work/north-carolina': '/',
    '/work/norway': '/',
    '/work/patagonia': '/',
    '/work/pnw': '/',
    '/work/uk': '/',
    '/gallery': '/',
    '/blog': 'https://corbinheist.substack.com',
  },
  integrations: [
    mdx(),
    sitemap(),
  ],
  outDir: process.env.ASTRO_OUT_DIR || 'dist',
  build: {
    assets: '_assets',
  },
});
