import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('habitat loads, manual actions feed, stop and reset work, and layouts remain accessible', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const app = page.locator('main.flytalk');
  await expect(app).toHaveAttribute('data-neural', 'ready', {
    timeout: 45_000,
  });
  await expect(page.locator('.habitat-canvas canvas')).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator('.scene-loading')).toHaveCount(0, {
    timeout: 45_000,
  });
  await expect(
    page.getByRole('heading', { name: 'Small fly. Big personality.' }),
  ).toBeVisible();
  await mkdir('outputs/screenshots', { recursive: true });
  await page.screenshot({ path: 'outputs/screenshots/desktop-rest.png' });
  await page
    .getByRole('button', { name: 'Come closer (4)', exact: true })
    .click();
  await expect(app).toHaveAttribute('data-action', 'COME');
  await expect(app).toHaveAttribute('data-phase', 'hovering', {
    timeout: 10_000,
  });
  await expect(page.locator('.thought-bubble')).toHaveClass(/is-visible/);
  await page.screenshot({ path: 'outputs/screenshots/desktop-approach.png' });
  await page.keyboard.press('9');
  await expect(app).toHaveAttribute('data-phase', 'offering');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-phase', 'feeding', {
    timeout: 10_000,
  });
  await page.screenshot({ path: 'outputs/screenshots/desktop-feeding.png' });
  await expect(app).toHaveAttribute('data-phase', 'grooming', {
    timeout: 10_000,
  });
  await expect(app).toHaveAttribute('data-phase', 'resting', {
    timeout: 10_000,
  });
  await page.keyboard.press('0');
  await expect(app).toHaveAttribute('data-action', 'VICTORY');
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-action', 'STOP');
  await page.keyboard.press('r');
  await expect(app).toHaveAttribute('data-phase', 'resting');
  await expect(app).toHaveAttribute('data-action', 'IDLE');
  await page.getByRole('button', { name: 'Neural lens', exact: false }).click();
  await expect(page.getByText('149,588', { exact: true })).toBeVisible();
  await expect(
    page.getByText('4,346,627 represented synapses', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'outputs/screenshots/neural-lens.png' });
  await page.getByRole('button', { name: 'Close Neural Lens' }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: 'outputs/screenshots/laptop-rest.png' });
  await expect(
    page.getByRole('button', { name: 'Offer nectar (9)', exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Offer nectar (9)', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: 'outputs/screenshots/mobile-controls.png' });
  expect(errors).toEqual([]);
});

test('official vision task loads in its worker and synthetic camera cleans up', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Connect your hand' }).click();
  await expect(page.locator('.camera-status')).toHaveAttribute(
    'data-state',
    /ready|tracking/,
    { timeout: 60_000 },
  );
  await expect(page.locator('.camera-loading')).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(page.locator('.camera-status')).not.toContainText(
    /could not|unavailable|stopped responding/i,
  );
  await expect(
    page.getByRole('button', { name: 'Turn camera off' }),
  ).toBeVisible();
  // Cold GPU compilation must not be mistaken for a stalled worker.
  await page.waitForTimeout(8000);
  await expect(page.locator('.camera-status')).toHaveAttribute(
    'data-state',
    /ready|tracking/,
  );
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(
    page.getByRole('button', { name: 'Connect your hand' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Connect your hand' }).click();
  await expect(page.locator('.camera-status')).toHaveAttribute(
    'data-state',
    /ready|tracking/,
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  expect(errors).toEqual([]);
});

test('neural failure preserves manual companion controls', async ({ page }) => {
  await page.route('**/data/manifest.json', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-neural', 'error');
  await page.getByRole('button', { name: 'Hello (1)', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-action', 'WAVE');
  await page.getByRole('button', { name: 'Neural lens', exact: false }).click();
  await expect(
    page.getByText('Neural data is unavailable.', { exact: false }),
  ).toBeVisible();
});

test('camera failure is recoverable and manual nectar stays available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () =>
        Promise.reject(new DOMException('Test denied', 'NotAllowedError')),
    });
  });
  await page.goto('/');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Connect your hand' }).click();
  await expect(page.locator('.camera-status')).toContainText(
    'Camera permission is off',
  );
  await expect(
    page.getByRole('button', { name: 'Retry camera' }),
  ).toBeVisible();
  await page.keyboard.press('9');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'offering');
});

test('35-second showcase completes a meal and manual input takes over', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Meet the fly' }).click();
  const app = page.locator('main');
  await expect(app).toHaveAttribute('data-demo', 'true');
  await expect(page.locator('.interaction-status')).toContainText(
    'Demo playback',
  );
  await expect(app).toHaveAttribute('data-phase', 'feeding', {
    timeout: 25_000,
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'outputs/screenshots/demo-feeding.png' });
  await expect(app).toHaveAttribute('data-phase', 'grooming', {
    timeout: 10_000,
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'outputs/screenshots/demo-grooming.png' });
  await expect(app).toHaveAttribute('data-demo', 'false', { timeout: 25_000 });
  await expect(app).toHaveAttribute('data-action', 'COME');
  await page.getByRole('button', { name: 'Meet the fly' }).click();
  await page.keyboard.press('2');
  await expect(app).toHaveAttribute('data-demo', 'false');
  await expect(app).toHaveAttribute('data-action', 'POINT_LEFT');
  await page.keyboard.press('h');
  await expect(page.locator('.app-header')).not.toBeVisible();
  await page.getByRole('button', { name: 'Show controls' }).click();
  await expect(page.locator('.app-header')).toBeVisible();
  expect(errors).toEqual([]);
});

test('missing anatomical assets show a retry and recover', async ({ page }) => {
  await page.route('**/models/fly/*.glb', (route) => route.abort());
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Try the habitat again' }),
  ).toBeVisible({ timeout: 45_000 });
  await page.unroute('**/models/fly/*.glb');
  // Vinext's development-only caught-error overlay can cover the retry UI.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Try the habitat again' }).click();
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
});

test('pointer nectar and a lost WebGL context recover through visible controls', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await page
    .getByRole('button', { name: 'Offer nectar (9)', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Place nectar on the selected perch' })
    .click({ position: { x: 1200, y: 450 } });
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'feeding', {
    timeout: 10_000,
  });
  await page.keyboard.press('r');
  await page.evaluate(() => {
    const canvas = document.querySelector(
      '.habitat-canvas canvas',
    ) as HTMLCanvasElement;
    canvas
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!
      .loseContext();
  });
  await expect(
    page.getByRole('button', { name: 'Restore habitat' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore habitat' }).click();
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  // Canvas retains hidden HTML fallback content even with a healthy context.
  await expect(page.locator('.scene-fallback')).not.toBeVisible();
  await expect(page.locator('.habitat-canvas canvas')).toBeVisible();
  await page.keyboard.press('4');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'hovering', {
    timeout: 10_000,
  });
});
