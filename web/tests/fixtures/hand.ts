import type { HandObservation, Landmark } from '../../src/vision/gestures';

type Pose =
  | 'neutral'
  | 'palm'
  | 'pinch'
  | 'index'
  | 'middle'
  | 'victory'
  | 'thumb';
interface Options {
  handedness?: 'Left' | 'Right';
  x?: number;
  y?: number;
  scale?: number;
  roll?: number;
  ratio?: number;
  categoryScore?: number;
}

// Anatomical landmark fixtures exercise the real geometry and temporal pipeline,
// rather than stubbing recognized intents at the controller boundary.
export function hand(pose: Pose, options: Options = {}): HandObservation {
  const p: Landmark[] = Array.from({ length: 21 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));
  p[1] = { x: -0.3, y: -0.15, z: 0 };
  p[2] = { x: -0.55, y: -0.35, z: 0 };
  p[3] = { x: -0.75, y: -0.55, z: 0 };
  p[4] = { x: -0.95, y: -0.7, z: 0 };
  const xs = [-0.35, -0.1, 0.15, 0.38];
  for (let finger = 0; finger < 4; finger++) {
    const mcp = 5 + finger * 4,
      x = xs[finger],
      y = -0.7;
    const extend =
      pose === 'palm' ||
      (pose === 'index' && finger === 0) ||
      (pose === 'middle' && finger === 1) ||
      (pose === 'victory' && finger < 2);
    p[mcp] = { x, y, z: 0 };
    p[mcp + 1] = { x, y: y - 0.3, z: 0 };
    p[mcp + 2] = { x, y: extend ? y - 0.6 : y + 0.02, z: extend ? 0 : -0.12 };
    p[mcp + 3] = { x, y: extend ? y - 0.9 : y + 0.16, z: extend ? 0 : -0.1 };
  }
  if (pose === 'pinch') {
    p[8] = { x: -0.55, y: -1.3, z: 0 };
    p[4] = { x: p[8].x + (options.ratio ?? 0.1) * 0.73, y: p[8].y, z: 0 };
  }
  const left = options.handedness === 'Left' ? -1 : 1;
  const rotation = options.roll ?? 0;
  const local = p.map((point) => ({
    x: point.x * left * Math.cos(rotation) - point.y * Math.sin(rotation),
    y: point.x * left * Math.sin(rotation) + point.y * Math.cos(rotation),
    z: point.z,
  }));
  const scale = 0.15 * (options.scale ?? 1);
  const category =
    (
      {
        palm: 'Open_Palm',
        index: 'Pointing_Up',
        thumb: 'Thumb_Up',
        victory: 'Victory',
        neutral: 'Closed_Fist',
      } as Partial<Record<Pose, string>>
    )[pose] ?? 'None';
  return {
    landmarks: local.map((point) => ({
      x: (options.x ?? 0.5) + point.x * scale,
      y: (options.y ?? 0.65) + point.y * scale,
      z: point.z * scale,
    })),
    worldLandmarks: local.map((point) => ({
      x: point.x * 0.03,
      y: point.y * 0.03,
      z: point.z * 0.03,
    })),
    handedness: options.handedness ?? 'Right',
    gesture: { categoryName: category, score: options.categoryScore ?? 0.99 },
  };
}
