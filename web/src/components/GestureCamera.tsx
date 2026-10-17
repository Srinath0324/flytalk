'use client';

// oxlint-disable-next-line import/default -- Vite supplies the constructor for ?worker imports.
import RecognitionWorker from '../vision/recognition.worker?worker';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Hand,
  LoaderCircle,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import type { InteractionEvent } from '../interaction/types';
import { GestureController, type RecognitionUpdate } from '../vision/gestures';
import type { VisionRequest, VisionResponse } from '../vision/protocol';

export interface CameraStatus {
  state:
    | 'off'
    | 'requesting'
    | 'loading'
    | 'ready'
    | 'tracking'
    | 'suspended'
    | 'error';
  label: string;
  progress: number;
  offering: boolean;
  delegate?: 'GPU' | 'CPU';
}
export interface GestureCameraProps {
  onInteraction: (event: InteractionEvent) => void;
  enabled: boolean;
  suspended?: boolean;
  resetKey?: number;
  onStatus?: (status: CameraStatus) => void;
}

const INITIAL: CameraStatus = {
  state: 'off',
  label: 'A small gesture. A new friend.',
  progress: 0,
  offering: false,
};
const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];
function startFramePump(
  video: HTMLVideoElement,
  onFrame: () => void,
): () => void {
  let running = true;
  let handle: number;
  const useVideo = typeof video.requestVideoFrameCallback === 'function';
  const tick = () => {
    if (!running) return;
    onFrame();
    handle = useVideo
      ? video.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  };
  handle = useVideo
    ? video.requestVideoFrameCallback(tick)
    : requestAnimationFrame(tick);
  return () => {
    running = false;
    if (useVideo) video.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
  };
}
function cameraError(problem: unknown): string {
  const name = problem instanceof DOMException ? problem.name : '';
  if (name === 'NotAllowedError')
    return 'Camera permission is off. Allow it in your browser, then retry.';
  if (name === 'NotFoundError')
    return 'No camera found. You can still use every control below.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Your camera is unavailable. Close other camera apps, then retry.';
  if (name === 'OverconstrainedError')
    return 'This camera cannot start with these settings. Try another camera.';
  return 'The camera could not start. All mouse and keyboard controls still work.';
}

export function GestureCamera({
  onInteraction,
  enabled,
  suspended = false,
  resetKey = 0,
  onStatus,
}: GestureCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controllerRef = useRef(new GestureController());
  const interactionRef = useRef(onInteraction);
  const statusCallbackRef = useRef(onStatus);
  const suspendedRef = useRef(suspended);
  const epochRef = useRef(0);
  const generationRef = useRef(0);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const delegateRef = useRef<'GPU' | 'CPU'>('GPU');
  const frameCleanupRef = useRef<(() => void) | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultRef = useRef(0);
  const firstResultRef = useRef(false);
  const lastStatusRef = useRef<CameraStatus>(INITIAL);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<CameraStatus>(INITIAL);
  const [aspect, setAspect] = useState(4 / 3);
  const [preview, setPreview] = useState(false);
  const [cameraSize, setCameraSize] = useState(340);

  useEffect(() => {
    interactionRef.current = onInteraction;
  }, [onInteraction]);
  useEffect(() => {
    statusCallbackRef.current = onStatus;
  }, [onStatus]);
  const emit = useCallback(
    (events: InteractionEvent[]) =>
      events.forEach((event) => interactionRef.current(event)),
    [],
  );
  const publish = useCallback((next: CameraStatus) => {
    // Avoid rerendering the page for every frame/landmark.
    const previous = lastStatusRef.current;
    if (
      previous.state === next.state &&
      previous.label === next.label &&
      previous.offering === next.offering &&
      previous.delegate === next.delegate &&
      Math.abs(previous.progress - next.progress) < 0.08
    )
      return;
    lastStatusRef.current = next;
    if (mountedRef.current) setStatus(next);
    statusCallbackRef.current?.(next);
  }, []);

  const clearOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const dispose = useCallback(() => {
    generationRef.current++;
    epochRef.current++;
    readyRef.current = false;
    firstResultRef.current = false;
    busyRef.current = false;
    if (startupTimeoutRef.current) clearTimeout(startupTimeoutRef.current);
    startupTimeoutRef.current = null;
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = null;
    const video = videoRef.current;
    frameCleanupRef.current?.();
    frameCleanupRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.onmute = null;
      track.onunmute = null;
      track.stop();
    });
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    const worker = workerRef.current;
    workerRef.current = null;
    if (worker) {
      // Give a healthy worker a chance to release its graph/GPU context.
      const kill = setTimeout(() => worker.terminate(), 300);
      worker.onmessage = (event: MessageEvent<VisionResponse>) => {
        if (event.data.type === 'closed') {
          clearTimeout(kill);
          worker.terminate();
        }
      };
      worker.onerror = () => {
        clearTimeout(kill);
        worker.terminate();
      };
      try {
        worker.postMessage({ type: 'close' } satisfies VisionRequest);
      } catch {
        clearTimeout(kill);
        worker.terminate();
      }
    }
    emit(controllerRef.current.reset(performance.now(), true));
    clearOverlay();
    if (mountedRef.current) setPreview(false);
  }, [clearOverlay, emit]);

  const fail = useCallback(
    (label: string) => {
      dispose();
      publish({ state: 'error', label, progress: 0, offering: false });
    },
    [dispose, publish],
  );
  const stop = useCallback(() => {
    dispose();
    publish({
      ...INITIAL,
      label: 'Camera off. Your little friend is still here.',
    });
  }, [dispose, publish]);

  const renderResult = useCallback(
    (result: RecognitionUpdate) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (result.hand) {
          const landmarks = result.hand.observation.landmarks;
          // Raw overlay and raw video share one CSS mirror and the same aspect.
          context.save();
          context.strokeStyle = '#062b19';
          context.lineWidth = 7;
          context.lineCap = 'round';
          context.beginPath();
          for (const [a, b] of CONNECTIONS) {
            context.moveTo(
              landmarks[a].x * canvas.width,
              landmarks[a].y * canvas.height,
            );
            context.lineTo(
              landmarks[b].x * canvas.width,
              landmarks[b].y * canvas.height,
            );
          }
          context.stroke();
          context.strokeStyle = '#39ff88';
          context.lineWidth = 3;
          context.shadowColor = '#20ff78';
          context.shadowBlur = 5;
          context.stroke();
          context.shadowBlur = 0;
          for (const [index, landmark] of landmarks.entries()) {
            context.fillStyle =
              result.offering && (index === 4 || index === 8)
                ? '#c0ff62'
                : '#39ff88';
            context.beginPath();
            context.arc(
              landmark.x * canvas.width,
              landmark.y * canvas.height,
              index === 4 || index === 8 ? 6 : 4,
              0,
              Math.PI * 2,
            );
            context.fill();
            context.strokeStyle = '#07351e';
            context.lineWidth = 1.5;
            context.stroke();
          }
          context.strokeStyle = result.offering ? '#c0ff62' : '#39ff88';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(
            (1 - result.hand.center.x) * canvas.width,
            result.hand.center.y * canvas.height,
            Math.max(14, result.hand.scale * canvas.height * 0.7),
            0,
            Math.PI * 2,
          );
          context.stroke();
          // Corner brackets stay readable against both skin and bright rooms.
          const xs = landmarks.map((p) => p.x * canvas.width);
          const ys = landmarks.map((p) => p.y * canvas.height);
          const x0 = Math.max(6, Math.min(...xs) - 14),
            x1 = Math.min(canvas.width - 6, Math.max(...xs) + 14);
          const y0 = Math.max(6, Math.min(...ys) - 14),
            y1 = Math.min(canvas.height - 6, Math.max(...ys) + 14);
          context.beginPath();
          for (const [x, y, sx, sy] of [
            [x0, y0, 1, 1],
            [x1, y0, -1, 1],
            [x0, y1, 1, -1],
            [x1, y1, -1, -1],
          ]) {
            context.moveTo(x + sx * 17, y);
            context.lineTo(x, y);
            context.lineTo(x, y + sy * 17);
          }
          context.stroke();
          context.restore();
        }
      }
      emit(result.events);
      publish({
        state: result.hand ? 'tracking' : 'ready',
        label: result.label,
        progress: result.progress,
        offering: result.offering,
        delegate: delegateRef.current,
      });
    },
    [emit, publish],
  );

  const start = useCallback(async () => {
    if (
      !enabled ||
      streamRef.current ||
      lastStatusRef.current.state === 'requesting' ||
      lastStatusRef.current.state === 'loading'
    )
      return;
    if (!navigator.mediaDevices?.getUserMedia) {
      fail(
        'Camera access needs HTTPS or localhost. Mouse and keyboard controls are ready.',
      );
      return;
    }
    dispose();
    const generation = generationRef.current;
    // A new session may start with a sign; reset/manual takeover requires neutral.
    controllerRef.current.reset(performance.now(), false);
    publish({
      state: 'requesting',
      label: 'Allow camera access in your browser. Video stays on this device.',
      progress: 0,
      offering: false,
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      if (generation !== generationRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        dispose();
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (generation !== generationRef.current) return;
      setPreview(true);
      const width = video.videoWidth || 640,
        height = video.videoHeight || 480;
      setAspect(width / height);
      if (canvasRef.current) {
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }
      publish({
        state: 'loading',
        label: 'Waking up hand tracking…',
        progress: 0,
        offering: false,
      });
      const track = stream.getVideoTracks()[0];
      track.onended = () =>
        fail(
          'Camera disconnected. Reconnect it and retry; every manual control still works.',
        );
      track.onmute = () => {
        epochRef.current++;
        emit(controllerRef.current.reset(performance.now(), true));
        clearOverlay();
        publish({
          state: 'ready',
          label: 'Camera paused. Check your camera switch.',
          progress: 0,
          offering: false,
        });
      };
      track.onunmute = () => {
        lastResultRef.current = performance.now();
        publish({
          state: suspendedRef.current ? 'suspended' : 'ready',
          label: suspendedRef.current
            ? 'Demo in progress · your camera is paused'
            : 'Relax your hand to continue',
          progress: 0,
          offering: false,
          delegate: delegateRef.current,
        });
      };
      const worker = new RecognitionWorker();
      workerRef.current = worker;
      startupTimeoutRef.current = setTimeout(() => {
        if (generation === generationRef.current)
          fail(
            'Hand tracking took too long to load. Retry, or explore with the controls below.',
          );
      }, 30000);
      let lastSent = -Infinity,
        lastVideoTime = -1;
      const capture = () => {
        if (generation !== generationRef.current) return;
        const now = performance.now();
        if (
          !readyRef.current ||
          busyRef.current ||
          suspendedRef.current ||
          document.hidden ||
          track.muted ||
          video.readyState < 2 ||
          video.currentTime === lastVideoTime ||
          // At 30 video frames/sec, a 24 Hz minimum interval drops every
          // second frame. Allow small callback jitter at the camera cadence.
          now - lastSent < 1000 / (delegateRef.current === 'CPU' ? 15 : 30) - 2
        )
          return;
        lastSent = now;
        lastVideoTime = video.currentTime;
        busyRef.current = true;
        const epoch = epochRef.current;
        const bitmapHeight = Math.max(
          1,
          Math.round(640 * (video.videoHeight / video.videoWidth)),
        );
        createImageBitmap(video, {
          resizeWidth: 640,
          resizeHeight: bitmapHeight,
          resizeQuality: 'low',
        })
          .then((bitmap) => {
            if (
              generation !== generationRef.current ||
              epoch !== epochRef.current ||
              suspendedRef.current
            ) {
              bitmap.close();
              if (generation === generationRef.current) busyRef.current = false;
              return;
            }
            try {
              worker.postMessage(
                {
                  type: 'frame',
                  bitmap,
                  time: now,
                  epoch,
                } satisfies VisionRequest,
                [bitmap],
              );
            } catch (error) {
              bitmap.close();
              throw error;
            }
          })
          .catch(() => {
            if (generation === generationRef.current) {
              busyRef.current = false;
              fail(
                'The camera frames could not be read. Retry or use the manual controls.',
              );
            }
          });
      };
      worker.onmessage = (event: MessageEvent<VisionResponse>) => {
        if (generation !== generationRef.current) return;
        const message = event.data;
        if (message.type === 'ready') {
          if (startupTimeoutRef.current)
            clearTimeout(startupTimeoutRef.current);
          startupTimeoutRef.current = null;
          delegateRef.current = message.delegate;
          readyRef.current = true;
          lastResultRef.current = performance.now();
          publish({
            state: suspendedRef.current ? 'suspended' : 'ready',
            label: suspendedRef.current
              ? 'Demo in progress · your camera is paused'
              : 'Show one hand · pinch to offer nectar',
            progress: 0,
            offering: false,
            delegate: message.delegate,
          });
          frameCleanupRef.current = startFramePump(video, capture);
        } else if (message.type === 'result') {
          busyRef.current = false;
          if (
            message.epoch !== epochRef.current ||
            suspendedRef.current ||
            document.hidden ||
            track.muted
          )
            return;
          firstResultRef.current = true;
          lastResultRef.current = performance.now();
          // A delayed result must never release an offer after tracking was lost.
          if (performance.now() - message.time > 350) return;
          renderResult(
            controllerRef.current.update(
              message.hands,
              message.time,
              message.aspect,
            ),
          );
        } else if (message.type === 'error') {
          busyRef.current = false;
          if (message.fatal) console.error('[FlyTalk vision]', message.message);
          if (message.fatal)
            fail(
              'Hand tracking could not start or was interrupted. Retry; the manual controls are always available.',
            );
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        console.error('[FlyTalk vision worker]', event.message);
        fail(
          'The hand-tracking worker could not start. Retry, or use the manual controls.',
        );
      };
      worker.postMessage({
        type: 'init',
        origin: window.location.origin,
      } satisfies VisionRequest);
      watchdogRef.current = setInterval(() => {
        if (
          generation !== generationRef.current ||
          !readyRef.current ||
          suspendedRef.current ||
          document.hidden ||
          track.muted
        )
          return;
        const staleFor = performance.now() - lastResultRef.current;
        if (staleFor > (firstResultRef.current ? 5000 : 15000))
          fail(
            'Hand tracking stopped responding. Retry, or use the manual controls.',
          );
        else if (staleFor > 250)
          renderResult(
            controllerRef.current.update([], performance.now(), width / height),
          );
      }, 100);
    } catch (problem) {
      if (generation === generationRef.current) fail(cameraError(problem));
    }
  }, [enabled, clearOverlay, dispose, emit, fail, publish, renderResult]);

  useEffect(() => {
    suspendedRef.current = suspended;
    epochRef.current++;
    emit(controllerRef.current.reset(performance.now(), true));
    clearOverlay();
    if (readyRef.current)
      publish({
        state: suspended ? 'suspended' : 'ready',
        label: suspended
          ? 'Demo in progress · your camera is paused'
          : 'Relax your hand to continue',
        progress: 0,
        offering: false,
        delegate: delegateRef.current,
      });
    lastResultRef.current = performance.now();
  }, [suspended, resetKey, clearOverlay, emit, publish]);

  useEffect(() => {
    if (
      !enabled &&
      (streamRef.current || lastStatusRef.current.state === 'requesting')
    )
      stop();
  }, [enabled, stop]);
  useEffect(() => {
    const visibility = () => {
      epochRef.current++;
      lastResultRef.current = performance.now();
      emit(controllerRef.current.reset(performance.now(), true));
      clearOverlay();
      if (readyRef.current && !suspendedRef.current)
        publish({
          state: 'ready',
          label: document.hidden
            ? 'Hand tracking paused'
            : 'Relax your hand to continue',
          progress: 0,
          offering: false,
          delegate: delegateRef.current,
        });
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [clearOverlay, emit, publish]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      dispose();
    };
  }, [dispose]);

  const pending = status.state === 'requesting' || status.state === 'loading';
  const active = preview || pending;
  return (
    <section
      className="ft-camera camera-panel"
      data-running={active}
      style={{ width: active ? cameraSize : 280 }}
      aria-label="Hand gesture camera"
    >
      <div className="camera-heading">
        <span>
          <Hand size={13} aria-hidden="true" /> HAND CONNECTION
        </span>
        <div className="camera-heading-actions">
          {active && (
            <button
              type="button"
              className="camera-stop"
              onClick={() => setCameraSize(cameraSize >= 480 ? 340 : 500)}
              aria-label={
                cameraSize >= 480
                  ? 'Shrink camera preview'
                  : 'Expand camera preview'
              }
              title="Resize camera preview"
            >
              {cameraSize >= 480 ? (
                <Minimize2 size={15} />
              ) : (
                <Maximize2 size={15} />
              )}
            </button>
          )}
          {active && (
            <button
              type="button"
              className="camera-stop"
              onClick={stop}
              title="Turn camera off"
              aria-label="Turn camera off"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div
        className="camera-viewport"
        style={{
          aspectRatio: preview ? aspect : undefined,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          className="camera-video"
          playsInline
          muted
          aria-label="Mirrored camera preview"
          style={{
            display: preview ? 'block' : 'none',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: 'scaleX(-1)',
          }}
        />
        <canvas
          ref={canvasRef}
          className="camera-overlay"
          aria-hidden="true"
          style={{
            display: preview ? 'block' : 'none',
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            transform: 'scaleX(-1)',
          }}
        />
        {!preview && (
          <button
            type="button"
            className="camera-start-btn"
            onClick={start}
            disabled={!enabled || pending}
          >
            {pending ? (
              <LoaderCircle
                size={25}
                className="camera-loading-icon"
                aria-hidden="true"
              />
            ) : status.state === 'error' ? (
              <CameraOff size={25} aria-hidden="true" />
            ) : (
              <Camera size={25} aria-hidden="true" />
            )}
            <span>
              {pending
                ? 'Connecting…'
                : status.state === 'error'
                  ? 'Retry camera'
                  : 'Connect your hand'}
            </span>
            <small>
              {pending ? 'You can cancel anytime' : 'Or use the controls below'}
            </small>
          </button>
        )}
        {preview && status.state === 'loading' && (
          <div className="camera-loading">
            <LoaderCircle size={22} aria-hidden="true" /> Loading hand model
          </div>
        )}
        {preview && suspended && (
          <div className="camera-suspended">Live gestures paused</div>
        )}
        {preview && status.state === 'tracking' && (
          <div className="camera-lock-label">● HAND LOCKED</div>
        )}
      </div>
      {active && (
        <label className="camera-size-control">
          <span>Preview size</span>
          <input
            type="range"
            min="260"
            max="520"
            step="20"
            value={cameraSize}
            onChange={(e) => setCameraSize(Number(e.target.value))}
            aria-label="Camera preview size"
          />
        </label>
      )}
      <output
        className="camera-status"
        data-state={status.state}
        data-delegate={status.delegate}
        aria-live="polite"
      >
        <span
          className={`status-dot ${status.state === 'tracking' ? 'active' : ''}`}
          aria-hidden="true"
        />
        <span>{status.label}</span>
      </output>
      {status.state === 'tracking' && (
        <div className="camera-recognition-progress" aria-hidden="true">
          <span style={{ width: `${status.progress * 100}%` }} />
        </div>
      )}
      <p className="camera-privacy">
        {status.offering
          ? 'Open your fingers to feed. Losing your hand cancels.'
          : 'Processed on your device. Camera video is never uploaded.'}
      </p>
    </section>
  );
}
