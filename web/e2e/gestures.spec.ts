import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { hand } from '../tests/fixtures/hand';

test('landmark camera stream controls the actual fly, keeps a green overlay, and resizes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    // Replace only the inference boundary. Geometry, timing, camera UI, input
    // router and fly director remain the real application code.
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        const vision = String(url).includes('recognition.worker');
        super(
          vision
            ? URL.createObjectURL(
                new Blob(['self.onmessage=()=>{}'], {
                  type: 'text/javascript',
                }),
              )
            : url,
          options,
        );
        if (vision)
          this.postMessage = (message: {
            type: string;
            time: number;
            epoch: number;
            bitmap?: ImageBitmap;
          }) => {
            if (message.type === 'init')
              setTimeout(
                () =>
                  this.onmessage?.(
                    new MessageEvent('message', {
                      data: { type: 'ready', delegate: 'GPU' },
                    }),
                  ),
                0,
              );
            if (message.type === 'frame') {
              message.bitmap?.close();
              setTimeout(
                () =>
                  this.onmessage?.(
                    new MessageEvent('message', {
                      data: {
                        type: 'result',
                        hands:
                          (window as unknown as { testHands: unknown[] })
                            .testHands ?? [],
                        time: message.time,
                        epoch: message.epoch,
                        aspect: 4 / 3,
                        inferenceMs: 1,
                      },
                    }),
                  ),
                8,
              );
            }
          };
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole('button', { name: 'Connect your hand' }).click();
  const setHand = async (observation: ReturnType<typeof hand> | null) => {
    await page.evaluate((h) => {
      (window as unknown as { testHands: unknown[] }).testHands = h ? [h] : [];
    }, observation);
  };
  await setHand(hand('thumb'));
  await expect(page.locator('main')).toHaveAttribute(
    'data-action',
    'THUMBS_UP',
  );
  await expect(page.getByText('HAND LOCKED', { exact: false })).toBeVisible();
  await setHand(hand('victory'));
  await expect(page.locator('main')).toHaveAttribute('data-action', 'VICTORY');
  await setHand(hand('index', { roll: Math.PI / 2 }));
  await expect(page.locator('main')).toHaveAttribute(
    'data-action',
    'POINT_LEFT',
  );
  await setHand(hand('index', { roll: -Math.PI / 2 }));
  await expect(page.locator('main')).toHaveAttribute(
    'data-action',
    'POINT_RIGHT',
  );
  await setHand(hand('pinch'));
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'offering');
  await setHand(hand('palm'));
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'feeding', {
    timeout: 10000,
  });
  const greenPixels = await page
    .locator('.camera-overlay')
    .evaluate((canvas) => {
      const c = canvas as HTMLCanvasElement;
      const data = c
        .getContext('2d')!
        .getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i + 1] > 200 &&
          data[i] < 130 &&
          data[i + 2] < 180 &&
          data[i + 3] > 100
        )
          n++;
      return n;
    });
  expect(greenPixels).toBeGreaterThan(200);
  const before = (await page.locator('.camera-panel').boundingBox())!.width;
  await page.getByRole('button', { name: 'Expand camera preview' }).click();
  expect(
    (await page.locator('.camera-panel').boundingBox())!.width,
  ).toBeGreaterThan(before);
  await page.getByRole('slider', { name: 'Camera preview size' }).fill('400');
  await expect(
    page.getByRole('slider', { name: 'Camera preview size' }),
  ).toHaveValue('400');
  await mkdir('outputs/screenshots', { recursive: true });
  await page.screenshot({
    path: 'outputs/screenshots/gesture-camera-green.png',
  });
  await expect(page.locator('.gesture-dock .hand-gesture-icon')).toHaveCount(
    10,
  );
  await page
    .getByRole('button', { name: 'Gesture guide', exact: true })
    .click();
  await expect(page.locator('.guide-grid .hand-gesture-icon')).toHaveCount(10);
});

test('real MediaPipe recognizes sample hand photos through the camera-to-action path', async ({
  page,
}) => {
  test.skip(
    !existsSync('../.research-tools/gesture-fixtures/thumbs_up.jpg'),
    'Run node scripts/fetch-gesture-fixtures.mjs first.',
  );
  for (const name of ['thumbs_up', 'pointing_up', 'victory']) {
    const body = await readFile(
      `../.research-tools/gesture-fixtures/${name}.jpg`,
    );
    await page.route(`**/__gesture_fixture/${name}.jpg`, (route) =>
      route.fulfill({ contentType: 'image/jpeg', body }),
    );
  }
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d')!;
    (
      window as unknown as { setHandPhoto: (name: string) => Promise<void> }
    ).setHandPhoto = async (name) => {
      const image = new Image();
      image.src = `/__gesture_fixture/${name.startsWith('pointing_') ? 'pointing_up' : name}.jpg`;
      await image.decode();
      context.fillStyle = '#ddd';
      context.fillRect(0, 0, 640, 480);
      const scale = Math.min(640 / image.width, 480 / image.height);
      context.save();
      context.translate(320, 240);
      context.rotate(
        name === 'pointing_left'
          ? Math.PI / 2
          : name === 'pointing_right'
            ? -Math.PI / 2
            : 0,
      );
      context.drawImage(
        image,
        (-image.width * scale) / 2,
        (-image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
      context.restore();
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => canvas.captureStream(30),
    });
    const refresh = () => {
      context.fillRect(0, 0, 1, 1);
      requestAnimationFrame(refresh);
    };
    requestAnimationFrame(refresh);
  });
  await page.goto('/');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: 45000,
  });
  await page.evaluate(() =>
    (
      window as unknown as { setHandPhoto: (n: string) => Promise<void> }
    ).setHandPhoto('thumbs_up'),
  );
  await page.getByRole('button', { name: 'Connect your hand' }).click();
  for (const [photo, intent] of [
    ['thumbs_up', 'THUMBS_UP'],
    ['pointing_up', 'COME'],
    ['pointing_left', 'POINT_LEFT'],
    ['pointing_right', 'POINT_RIGHT'],
    ['victory', 'VICTORY'],
  ]) {
    await page.evaluate(
      (name) =>
        (
          window as unknown as { setHandPhoto: (n: string) => Promise<void> }
        ).setHandPhoto(name),
      photo,
    );
    await expect(page.locator('main')).toHaveAttribute('data-action', intent, {
      timeout: 45000,
    });
  }
  await page.screenshot({ path: 'outputs/screenshots/real-hand-model.png' });
});
