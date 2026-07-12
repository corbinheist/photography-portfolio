import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ?? (existsSync(systemChrome) ? systemChrome : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'pnpm preview',
    port: 4321,
    reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== 'false',
  },
  use: {
    baseURL: 'http://localhost:4321',
    launchOptions: executablePath
      ? { executablePath }
      : undefined,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
