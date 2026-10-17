import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

// The decks build into the pitch/ directory of the site output, so every
// deck keeps its /pitch/<name>/ URL. Run this build after the site build:
// the site build empties its output directory first.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const siteOutDir = path.resolve(repoRoot, process.env.ASTRO_OUT_DIR || 'dist');

export default defineConfig({
  output: 'static',
  site: 'https://heist.studio',
  base: '/pitch',
  outDir: path.join(siteOutDir, 'pitch'),
  build: {
    assets: '_assets',
  },
  vite: {
    // Read PUBLIC_MAPTILER_KEY from the repository .env, as the site does.
    envDir: repoRoot,
  },
});
