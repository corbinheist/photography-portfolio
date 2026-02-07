import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://example.com', // TODO: replace with actual domain
  build: {
    assets: '_assets',
  },
});
