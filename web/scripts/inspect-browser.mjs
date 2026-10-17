import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE', m.text());
  });
  page.on('requestfailed', (r) =>
    console.log('REQUEST FAILED', r.url(), r.failure()?.errorText),
  );
  page.on('response', (r) => {
    if (r.status() >= 400) console.log('HTTP ERROR', r.status(), r.url());
  });
  page.on('worker', (w) => {
    w.on('console', (m) => console.log('WORKER', m.text()));
  });
  await page.goto(process.env.FLYTALK_URL ?? 'http://localhost:3000', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('main.flytalk', { timeout: 45000 });
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 60000 });
  if (process.argv.includes('--camera')) {
    await page.getByRole('button', { name: 'Connect your hand' }).click();
    await page.waitForFunction(
      () =>
        ['error', 'ready', 'tracking'].includes(
          document.querySelector('.camera-status')?.getAttribute('data-state'),
        ),
      {},
      { timeout: 40000 },
    );
    console.log('CAMERA', await page.locator('.camera-status').innerText());
    console.log(
      'CAMERA DETAILS',
      await page.locator('.camera-status').getAttribute('data-error'),
    );
    await page.waitForTimeout(8000);
  }
  await page.getByRole('button', { name: 'Neural lens', exact: false }).click();
  await page.waitForTimeout(3000);
  console.log('STATE', await page.locator('main').getAttribute('data-neural'));
  console.log(
    'NEURAL ERROR',
    await page.locator('main').getAttribute('data-neural-error'),
  );
  console.log('DRAWER', await page.locator('.neural-drawer').innerText());
  console.log('METRICS', await page.getByTestId('render-metrics').innerText());
  await mkdir('outputs/screenshots', { recursive: true });
  await page.screenshot({ path: 'outputs/screenshots/inspection.png' });
} finally {
  await browser.close();
}
