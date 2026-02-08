import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://heist.studio',
  build: {
    assets: '_assets',
  },
});
