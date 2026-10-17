import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://heist.studio',
  redirects: {
    // The Lofoten album moved to a story with a slug that does not contain "test".
    '/work/norway/norway-test': '/work/lofoten-oslo/',
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
