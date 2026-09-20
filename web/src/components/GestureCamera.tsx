'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Gesture, GestureEvent } from '../simulation/types';

/* ─── Landmark indices ─── */
const WRIST = 0;
const THUMB_TIP = 4, THUMB_IP = 3, THUMB_MCP = 2;
const INDEX_TIP = 8, INDEX_PIP = 6, INDEX_MCP = 5;
const MIDDLE_TIP = 12, MIDDLE_PIP = 10, MIDDLE_MCP = 9;
const RING_TIP = 16, RING_PIP = 14;
const PINKY_TIP = 20, PINKY_PIP = 18;

interface Landmark { x: number; y: number; z: number }

function isExtended(tip: Landmark, pip: Landmark, mcp: Landmark): boolean {
  const dy = tip.y - mcp.y;
  const pipDy = pip.y - mcp.y;
  return dy < pipDy - 0.02;
}

function isThumbExtended(tip: Landmark, ip: Landmark, mcp: Landmark, wrist: Landmark): boolean {
  const dx = Math.abs(tip.x - wrist.x);
  const mcpDx = Math.abs(mcp.x - wrist.x);
  return dx > mcpDx + 0.03;
}

function isCurled(tip: Landmark, pip: Landmark, mcp: Landmark): boolean {
  return tip.y > pip.y + 0.01;
}

function classifyGesture(landmarks: Landmark[]): Gesture | null {
  const w = landmarks[WRIST];
  const thumb = isThumbExtended(landmarks[THUMB_TIP], landmarks[THUMB_IP], landmarks[THUMB_MCP], w);
  const index = isExtended(landmarks[INDEX_TIP], landmarks[INDEX_PIP], landmarks[INDEX_MCP]);
  const middle = isExtended(landmarks[MIDDLE_TIP], landmarks[MIDDLE_PIP], landmarks[MIDDLE_MCP]);
  const ring = isExtended(landmarks[RING_TIP], landmarks[RING_PIP], landmarks[RING_PIP]);
  const pinky = isExtended(landmarks[PINKY_TIP], landmarks[PINKY_PIP], landmarks[PINKY_PIP]);

  const indexCurled = isCurled(landmarks[INDEX_TIP], landmarks[INDEX_PIP], landmarks[INDEX_MCP]);
  const middleCurled = isCurled(landmarks[MIDDLE_TIP], landmarks[MIDDLE_PIP], landmarks[MIDDLE_MCP]);
  const ringCurled = isCurled(landmarks[RING_TIP], landmarks[RING_PIP], landmarks[RING_PIP]);
  const pinkyCurled = isCurled(landmarks[PINKY_TIP], landmarks[PINKY_PIP], landmarks[PINKY_PIP]);

  // THUMBS_UP: thumb extended, all others curled
  if (thumb && indexCurled && middleCurled && ringCurled && pinkyCurled) return 'THUMBS_UP';

  // MIDDLE_FINGER: only middle finger extended
  if (middle && !index && !ring && !pinky) return 'MIDDLE_FINGER';

  // COME: only index finger up (pointing up)
  if (index && !middle && !ring && !pinky) {
    const idx = landmarks[INDEX_TIP];
    // Check if pointing left or right by comparing tip x to mcp x
    const dx = idx.x - landmarks[INDEX_MCP].x;
    const dy = idx.y - landmarks[INDEX_MCP].y;
    if (Math.abs(dx) > Math.abs(dy) * 0.8) {
      // Horizontal pointing — note: camera is mirrored
      return dx < 0 ? 'POINT_RIGHT' : 'POINT_LEFT';
    }
    return 'COME';
  }

  // All fingers extended
  if (index && middle && ring && pinky) {
    // Check for forward push (GO_AWAY): z of fingertips closer to camera
    const avgZ = (landmarks[INDEX_TIP].z + landmarks[MIDDLE_TIP].z + landmarks[RING_TIP].z + landmarks[PINKY_TIP].z) / 4;
    const wristZ = w.z;
    if (avgZ < wristZ - 0.06) return 'GO_AWAY';

    // WAVE: open hand — check if palm is relatively flat/facing camera
    // STOP: also open palm
    const palmWidth = Math.abs(landmarks[INDEX_MCP].x - landmarks[PINKY_PIP].x);
    if (palmWidth > 0.12) return 'STOP';
    return 'WAVE';
  }

  return null;
}

interface Props {
  onGesture: (event: GestureEvent) => void;
  enabled: boolean;
}

export function GestureCamera({ onGesture, enabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const frameRef = useRef(0);
  const lastGestureRef = useRef<string | null>(null);
  const lastGestureTimeRef = useRef(0);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      console.warn('Camera access denied');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setDetecting(false);
    cancelAnimationFrame(frameRef.current);
  }, []);

  // Load MediaPipe
  useEffect(() => {
    if (!cameraActive || !enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const wasmFileset = await FilesetResolver.forVisionTasks('/models/wasm').catch(() =>
          FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
        );
        const landmarker = await HandLandmarker.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        if (cancelled) { landmarker.close(); return; }
        handLandmarkerRef.current = landmarker;
        setDetecting(true);
      } catch (err) {
        console.error('MediaPipe init failed:', err);
      }
    })();


    return () => { cancelled = true; };
  }, [cameraActive, enabled]);

  // Detection loop
  useEffect(() => {
    if (!detecting || !handLandmarkerRef.current || !videoRef.current) return;
    const landmarker = handLandmarkerRef.current;
    const video = videoRef.current;
    let running = true;

    const detect = () => {
      if (!running || video.readyState < 2) { frameRef.current = requestAnimationFrame(detect); return; }
      try {
        const result = landmarker.detectForVideo(video, performance.now());
        if (result.landmarks?.length > 0) {
          const gesture = classifyGesture(result.landmarks[0]);
          const now = Date.now();
          if (gesture && (gesture !== lastGestureRef.current || now - lastGestureTimeRef.current > 2000)) {
            lastGestureRef.current = gesture;
            lastGestureTimeRef.current = now;
            setLastGesture(gesture);
            onGesture({ gesture, timestamp: now, source: 'camera' });
          }

          // Draw landmarks on canvas
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx && canvasRef.current) {
            const cw = canvasRef.current.width;
            const ch = canvasRef.current.height;
            ctx.clearRect(0, 0, cw, ch);
            ctx.fillStyle = '#22c55e';
            for (const lm of result.landmarks[0]) {
              ctx.beginPath();
              ctx.arc(lm.x * cw, lm.y * ch, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      } catch { /* skip frame */ }
      frameRef.current = requestAnimationFrame(detect);
    };
    frameRef.current = requestAnimationFrame(detect);
    return () => { running = false; cancelAnimationFrame(frameRef.current); };
  }, [detecting, onGesture]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="camera-panel">
      <div className="camera-viewport">
        <video ref={videoRef} className="camera-video" playsInline muted style={{ display: cameraActive ? 'block' : 'none' }} />
        <canvas ref={canvasRef} className="camera-overlay" width={640} height={480} style={{ display: cameraActive ? 'block' : 'none' }} />
        {!cameraActive && (
          <button onClick={startCamera} className="camera-start-btn" type="button">
            <span className="camera-icon">📷</span>
            <span>Enable Camera</span>
            <span className="camera-hint">Hand gestures will control the fly</span>
          </button>
        )}
      </div>
      {cameraActive && (
        <div className="camera-status">
          <span className={`status-dot ${detecting ? 'active' : ''}`} />
          {detecting ? `Tracking${lastGesture ? ` · ${lastGesture}` : ''}` : 'Loading model…'}
        </div>
      )}
    </div>
  );
}
