import type { Point2, Vec3 } from './types';

// Scene coordinates: Y up, the fly's forward axis is +Z. One body is ~1 unit.
export const FOOT_HEIGHT = 0.34;
export const PERCHES = [
  {
    id: 'leaf',
    label: 'The velvet leaf',
    surface: [-1.65, 0.72, 0.65] as Vec3,
    yaw: 0.35,
  },
  {
    id: 'fruit',
    label: 'The peach slice',
    surface: [1.65, 0.78, -0.1] as Vec3,
    yaw: -0.4,
  },
  {
    id: 'stone',
    label: 'The warm stone',
    surface: [0.1, 0.3, -1.55] as Vec3,
    yaw: 0,
  },
] as const;
export function perchById(id?: string) {
  return PERCHES.find((p) => p.id === id) ?? PERCHES[0];
}
export function restingPosition(id = 'leaf'): Vec3 {
  const p = perchById(id).surface;
  return [p[0], p[1] + FOOT_HEIGHT, p[2]];
}
export function targetToWorld(target: Point2): Vec3 {
  const up = 1 - Math.max(0, Math.min(1, target.y));
  return [
    (Math.max(0, Math.min(1, target.x)) - 0.5) * 6,
    0.95 + up * 2.2,
    0.7 - up * 2.5,
  ];
}
export function nearestPerch(position: Vec3) {
  return [...PERCHES].sort(
    (a, b) =>
      Math.hypot(a.surface[0] - position[0], a.surface[2] - position[2]) -
      Math.hypot(b.surface[0] - position[0], b.surface[2] - position[2]),
  )[0];
}
export function nectarPosition(id: string): Vec3 {
  const p = perchById(id);
  return [
    p.surface[0] + Math.sin(p.yaw) * 0.48,
    p.surface[1] + 0.05,
    p.surface[2] + Math.cos(p.yaw) * 0.48,
  ];
}
