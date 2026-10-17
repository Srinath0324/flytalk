import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

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
  await page.addInitScript(() => {
    window.flyTalkBenchmark = { inferences: [], steps: [] };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          const metric = window.flyTalkBenchmark;
          if (data.type === 'result')
            metric.inferences.push({
              time: performance.now(),
              ms: data.inferenceMs,
            });
          if (data.type === 'snapshot') metric.steps.push(data.snapshot.stepMs);
          if (metric.inferences.length > 2000) metric.inferences.shift();
          if (metric.steps.length > 2000) metric.steps.shift();
        });
      }
    };
  });
  await page.goto(process.env.FLYTALK_URL ?? 'http://localhost:3000', {
    timeout: 60000,
  });
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Connect your hand' }).click();
  await page.waitForFunction(
    () =>
      ['ready', 'tracking'].includes(
        document.querySelector('.camera-status')?.getAttribute('data-state'),
      ),
    {},
    { timeout: 40000 },
  );
  await page.waitForTimeout(10000);
  await page.evaluate(() => {
    window.flyTalkBenchmark.inferences = [];
    window.flyTalkBenchmark.steps = [];
  });
  const samples = [];
  for (const key of ['1', '3', '4', '2', '8', '9', 'Enter', '5']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(2000);
    samples.push({
      action: key,
      metrics: await page.getByTestId('render-metrics').textContent(),
      quality: await page
        .locator('.habitat-canvas')
        .getAttribute('data-quality'),
    });
  }
  const measured = await page.evaluate(() => {
    const { inferences, steps } = window.flyTalkBenchmark;
    const avg = (values) =>
      values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const gl = document
      .querySelector('.habitat-canvas canvas')
      .getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      inferenceCount: inferences.length,
      inferenceHz:
        inferences.length > 1
          ? ((inferences.length - 1) * 1000) /
            (inferences.at(-1).time - inferences[0].time)
          : 0,
      meanInferenceMs: avg(inferences.map((r) => r.ms)),
      meanSimulationStepMs: avg(steps.filter((ms) => ms > 0)),
      renderer: info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      cameraState: document
        .querySelector('.camera-status')
        .getAttribute('data-state'),
      delegate: document
        .querySelector('.camera-status')
        .getAttribute('data-delegate'),
    };
  });
  const report = {
    viewport: '1920x1080',
    browser: await browser.version(),
    camera: 'Chrome synthetic video device, no real hands',
    samples,
    ...measured,
  };
  await mkdir('outputs', { recursive: true });
  await writeFile('outputs/benchmark.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
