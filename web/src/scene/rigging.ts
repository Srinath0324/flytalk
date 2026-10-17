import * as THREE from 'three';
import type { Vec3 } from '../interaction/types';

export const LEG_JOINTS = ['left', 'right'].flatMap((side) =>
  [1, 2, 3].map((pair) => ({
    side,
    pair,
    hip: `coxa_T${pair}_${side}`,
    femur: `femur_T${pair}_${side}`,
    tibia: `tibia_T${pair}_${side}`,
    foot: `tarsus_T${pair}_1_${side}`,
    tip: `tarsal_claw_T${pair}_${side}`,
  })),
);

export function contactHeight(id: string, x: number, z: number) {
  if (id === 'stone')
    return (
      0.07 +
      0.25 *
        Math.sqrt(
          Math.max(0, 1 - ((x - 0.1) / 0.95) ** 2 - ((z + 1.55) / 0.65) ** 2),
        )
    );
  if (id === 'fruit') return 0.781;
  const dx = x + 1.65,
    dz = z - 0.65,
    c = Math.cos(0.35),
    s = Math.sin(0.35);
  const lx = dx * c - dz * s,
    lz = dx * s + dz * c;
  const t = THREE.MathUtils.clamp((lz + 1.275) / 2.55, 0.001, 0.999);
  const width = Math.pow(Math.sin(t * Math.PI), 0.78) * 0.7;
  return (
    0.71 +
    Math.pow(Math.min(1, Math.abs(lx) / width), 3) * 0.12 +
    Math.pow(Math.abs(t - 0.5) * 2, 4) * 0.09
  );
}

/** Authored stance patches keep the rear feet inside the cut fruit's outline. */
export function footTarget(
  id: string,
  position: Vec3,
  yaw: number,
  rest: THREE.Vector3,
  out: THREE.Vector3,
) {
  const x = rest.x * (id === 'stone' ? 0.82 : id === 'fruit' ? 0.9 : 1);
  const z = rest.z * (id === 'stone' ? 0.82 : id === 'fruit' ? 0.66 : 1);
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  out.set(position[0] + x * c + z * s, 0, position[2] - x * s + z * c);
  out.y = contactHeight(id, out.x, out.z) + 0.006;
  return out;
}

export function createIKScratch() {
  return {
    pivot: new THREE.Vector3(),
    end: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    parent: new THREE.Quaternion(),
  };
}

export function solveJointChain(
  nodes: Record<string, THREE.Object3D>,
  chain: string[],
  tip: string,
  target: THREE.Vector3,
  ik: ReturnType<typeof createIKScratch>,
  iterations = 14,
) {
  const end = nodes[tip];
  if (!end) return;
  for (let pass = 0; pass < iterations; pass++) {
    if (end.getWorldPosition(ik.end).distanceToSquared(target) < 0.000001)
      break;
    for (let j = chain.length - 1; j >= 0; j--) {
      const joint = nodes[chain[j]];
      if (!joint?.parent) continue;
      joint.getWorldPosition(ik.pivot);
      end.getWorldPosition(ik.end);
      ik.a.subVectors(ik.end, ik.pivot).normalize();
      ik.b.subVectors(target, ik.pivot).normalize();
      const angle = Math.min(
        0.3,
        Math.acos(THREE.MathUtils.clamp(ik.a.dot(ik.b), -1, 1)),
      );
      ik.axis.crossVectors(ik.a, ik.b);
      if (ik.axis.lengthSq() < 1e-9) continue;
      ik.axis.normalize();
      joint.parent.getWorldQuaternion(ik.parent);
      ik.axis.applyQuaternion(ik.parent.invert());
      ik.q.setFromAxisAngle(ik.axis, angle);
      joint.quaternion.premultiply(ik.q);
      joint.updateMatrixWorld(true);
    }
  }
}
