import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: './outputs/browser-results',
  use: {
    baseURL: process.env.FLYTALK_URL ?? 'http://localhost:3000',
    viewport: { width: 1920, height: 1080 },
    channel: 'chrome',
    headless: true,
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
