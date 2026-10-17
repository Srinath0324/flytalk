import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import type { VisionRequest, VisionResponse } from './protocol';

let recognizer: GestureRecognizer | null = null;
let closing = false;
let initializing = false;
let frameErrors = 0;
const send = (message: VisionResponse) => self.postMessage(message);

// MediaPipe's module-worker loader calls this hook after importScripts throws.
// Restore the factory on every load: dynamic import is cached, but MediaPipe
// clears ModuleFactory after construction. Without this, GPU -> CPU retry fails.
const workerScope = self as typeof self & {
  import?: (url: string) => Promise<void>;
  ModuleFactory?: unknown;
};
workerScope.import = async (url) => {
  // Preserve a .js suffix so Vite does not inject its window-based HMR client
  // into this worker. The module build is pinned by forVisionTasks(..., true).
  const origin = new URL(url).origin;
  const wasmModule = await import(
    /* @vite-ignore */ `${origin}/models/wasm/vision_wasm_module_internal.js`
  );
  workerScope.ModuleFactory = wasmModule.default;
};

self.onmessage = async (event: MessageEvent<VisionRequest>) => {
  const message = event.data;
  if (message.type === 'close') {
    closing = true;
    try {
      recognizer?.close();
    } finally {
      recognizer = null;
      send({ type: 'closed' });
    }
    return;
  }
  if (message.type === 'init') {
    if (initializing || recognizer || closing) return;
    initializing = true;
    try {
      // Module-compatible WASM avoids importScripts in a Vite module worker.
      const fileset = await FilesetResolver.forVisionTasks(
        `${message.origin}/models/wasm`,
        true,
      );
      let delegate: 'GPU' | 'CPU' = 'GPU';
      const create = (device: 'GPU' | 'CPU') =>
        GestureRecognizer.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: `${message.origin}/models/gesture_recognizer.task`,
            delegate: device,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          cannedGesturesClassifierOptions: { scoreThreshold: 0.65 },
        });
      try {
        recognizer = await create('GPU');
      } catch {
        if (closing) return;
        delegate = 'CPU';
        recognizer = await create('CPU');
      }
      if (closing) {
        recognizer.close();
        recognizer = null;
        return;
      }
      send({ type: 'ready', delegate });
    } catch (error) {
      if (!closing)
        send({
          type: 'error',
          fatal: true,
          message:
            error instanceof Error
              ? error.message
              : 'Hand model could not load',
        });
    } finally {
      initializing = false;
    }
  } else if (message.type === 'frame') {
    const { bitmap, time, epoch } = message;
    try {
      if (!recognizer || closing) return;
      const start = performance.now();
      const result = recognizer.recognizeForVideo(bitmap, time);
      frameErrors = 0;
      send({
        type: 'result',
        time,
        epoch,
        aspect: bitmap.width / bitmap.height,
        inferenceMs: performance.now() - start,
        hands: result.landmarks.map((landmarks, index) => ({
          landmarks,
          worldLandmarks: result.worldLandmarks[index],
          handedness: result.handedness[index]?.[0]?.categoryName,
          gesture: result.gestures[index]?.[0],
        })),
      });
    } catch (error) {
      send({
        type: 'error',
        fatal: ++frameErrors >= 3,
        message:
          error instanceof Error ? error.message : 'Hand tracking interrupted',
      });
    } finally {
      bitmap.close();
    }
  }
};
