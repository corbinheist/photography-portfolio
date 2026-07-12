import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://heist.studio',
  integrations: [
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;
        return !pathname.startsWith('/pitch/') && pathname !== '/essays/example/';
      },
    }),
  ],
  outDir: process.env.ASTRO_OUT_DIR || 'dist',
  build: {
    assets: '_assets',
  },
});
