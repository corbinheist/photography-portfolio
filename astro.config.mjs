import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://heist.studio',
  redirects: {
    // The Lofoten album moved to a story with a slug that does not contain "test".
    '/work/norway/norway-test': '/work/lofoten-oslo/',
    // The region index, the region pages, the gallery, and the blog were removed (STU-23, STU-24).
    '/work': '/',
    '/work/france': '/',
    '/work/italy': '/',
    '/work/japan': '/',
    '/work/montana': '/',
    '/work/morocco': '/',
    '/work/north-carolina': '/',
    '/work/norway': '/',
    '/work/patagonia': '/',
    '/work/pnw': '/',
    '/work/uk': '/',
    '/work/patagonia/briefing': '/',
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
