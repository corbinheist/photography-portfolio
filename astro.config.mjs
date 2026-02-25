import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://heist.studio',
  outDir: process.env.ASTRO_OUT_DIR || 'dist',
  build: {
    assets: '_assets',
  },
});
