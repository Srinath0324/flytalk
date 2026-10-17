'use client';
/* oxlint-disable react/react-compiler -- Three.js objects are intentionally mutated in useFrame, outside React rendering. */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ActionDirector } from '../interaction/director';
import { nectarPosition, PERCHES } from '../interaction/world';

import {
  LEG_JOINTS,
  footTarget,
  createIKScratch,
  solveJointChain,
} from './rigging';

// The asset exporter gives anatomical parts stable semantic names.
export function FlyModel({
  director,
  low,
  vigor = 1,
}: {
  director: ActionDirector;
  low: boolean;
  vigor?: number;
}) {
  const asset = useGLTF(`/models/fly/fly-${low ? 'low' : 'high'}.glb`);
  const rig = useMemo(() => {
    const scene = asset.scene.clone(true);
    const nodes: Record<string, THREE.Object3D> = {};
    const rests = new Map<THREE.Object3D, THREE.Quaternion>();
    const materials: THREE.Material[] = [];
    scene.traverse((node) => {
      nodes[node.name] = node;
      rests.set(node, node.quaternion.clone());
      if (node instanceof THREE.Mesh) {
        // Fine bristles and joints do not need their own shadow draw. The body
        // silhouette gives stable contact without shimmering subpixel shadows.
        node.castShadow =
          /^(thorax|head|abdomen_)/.test(node.name) &&
          !/bristle|black/.test(node.name);
        node.receiveShadow = true;
        if (node.name.includes('membrane')) {
          const mat = new THREE.MeshPhysicalMaterial({
            color: '#bed7b9',
            roughness: 0.22,
            transparent: true,
            opacity: 0.23,
            iridescence: 1,
            iridescenceIOR: 1.3,
            iridescenceThicknessRange: [180, 500],
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          node.material = mat;
          node.castShadow = false;
          materials.push(mat);
        }
      }
    });
    scene.updateMatrixWorld(true);
    const feet = LEG_JOINTS.map((leg) => ({
      ...leg,
      target: nodes[leg.tip].getWorldPosition(new THREE.Vector3()),
    }));
    return { scene, nodes, rests, feet, materials };
  }, [asset]);
  useEffect(() => () => rig.materials.forEach((m) => m.dispose()), [rig]);
  const root = useRef<THREE.Group>(null);
  const blurL = useRef<THREE.Mesh>(null),
    blurR = useRef<THREE.Mesh>(null);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const smoothVigor = useRef(1);
  const ik = useMemo(
    () => ({
      ...createIKScratch(),
      target: new THREE.Vector3(),
      groom: new THREE.Vector3(),
    }),
    [],
  );
  useFrame((_, delta) => {
    const { pose, time, phase, nectar } = director.snapshot;
    if (!root.current) return;
    smoothVigor.current = THREE.MathUtils.damp(
      smoothVigor.current,
      vigor,
      8,
      delta,
    );
    root.current.position.set(...pose.position);
    root.current.rotation.set(
      pose.pitch + pose.feed * 0.34,
      pose.yaw,
      pose.roll,
      'YXZ',
    );
    const t = time / 1000,
      flight = pose.flight,
      groom = pose.groom;
    const rotate = (name: string, x = 0, y = 0, z = 0) => {
      const node = rig.nodes[name];
      if (!node) return;
      euler.set(x, y, z);
      quaternion.setFromEuler(euler);
      node.quaternion.copy(rig.rests.get(node)!).multiply(quaternion);
    };
    const look = Math.max(
      -0.35,
      Math.min(
        0.35,
        Math.atan2(
          pose.attention[0] - pose.position[0],
          pose.attention[2] - pose.position[2],
        ) - pose.yaw,
      ),
    );
    rotate(
      'head',
      pose.feed * 0.2 + groom * 0.15,
      look * 0.3,
      Math.sin(t * 1.2) * 0.025,
    );
    rotate('abdomen_1', Math.sin(t * 2) * 0.018 + flight * 0.08);
    rotate(
      'antenna_left',
      Math.sin(t * 4.2) * 0.06,
      0,
      Math.sin(t * 2.1) * 0.05,
    );
    rotate(
      'antenna_right',
      Math.sin(t * 4.2 + 0.8) * 0.06,
      0,
      -Math.sin(t * 2.1) * 0.05,
    );
    rotate('rostrum', pose.feed * -0.9);
    rotate('haustellum', pose.feed * 0.9);
    for (const side of ['left', 'right']) {
      const sign = side === 'left' ? 1 : -1;
      rotate(
        `wing_${side}`,
        flight * -0.08,
        -sign * flight * 1.2,
        sign * flight * 0.12,
      );
      const wing = rig.nodes[`wing_${side}`];
      if (wing) wing.visible = flight < 0.6;
      for (let leg = 1; leg <= 3; leg++) {
        rotate(
          `coxa_T${leg}_${side}`,
          flight * 0.6 +
            (leg === 1 ? groom * (0.5 + Math.sin(t * 11) * 0.12) : 0),
          0,
          sign * flight * 0.25,
        );
        rotate(
          `femur_T${leg}_${side}`,
          flight * -0.5 + (leg === 1 ? groom * -0.35 : 0),
        );
        rotate(
          `tibia_T${leg}_${side}`,
          flight * 0.65 +
            (leg === 1 ? groom * (0.3 + Math.cos(t * 11) * 0.15) : 0),
        );
        rotate(`tarsus_T${leg}_1_${side}`);
      }
    }
    root.current.updateMatrixWorld(true);
    const solve = (
      chain: string[],
      tip: string,
      target: THREE.Vector3,
      iterations = 14,
    ) => {
      solveJointChain(rig.nodes, chain, tip, target, ik, iterations);
    };
    if (flight < 0.02 && ['resting', 'feeding', 'grooming'].includes(phase)) {
      const perch = [...PERCHES].sort(
        (a, b) =>
          Math.hypot(
            a.surface[0] - pose.position[0],
            a.surface[2] - pose.position[2],
          ) -
          Math.hypot(
            b.surface[0] - pose.position[0],
            b.surface[2] - pose.position[2],
          ),
      )[0];
      for (const leg of rig.feet) {
        footTarget(perch.id, pose.position, pose.yaw, leg.target, ik.target);
        if (leg.pair === 1 && groom > 0) {
          const sign = leg.side === 'left' ? 1 : -1;
          ik.groom.set(
            sign * (0.09 + Math.sin(t * 10) * 0.015),
            0.02 + Math.sin(t * 10 + sign * 0.7) * 0.045,
            0.36,
          );
          root.current.localToWorld(ik.groom);
          ik.target.lerp(ik.groom, groom);
        }
        solve([leg.hip, leg.femur, leg.tibia, leg.foot], leg.tip, ik.target);
      }
      if (pose.feed > 0.01 && nectar) {
        ik.target.set(...nectarPosition(nectar.perchId));
        solve(['rostrum', 'haustellum'], 'labrum_left', ik.target, 8);
      }
    }
    for (const [mesh, sign] of [
      [blurL.current, -1],
      [blurR.current, 1],
    ] as const)
      if (mesh) {
        mesh.visible = flight > 0.03;
        mesh.rotation.set(-0.15, sign * 0.25, Math.sin(t * 28) * 0.025);
        (mesh.material as THREE.ShaderMaterial).uniforms.opacity.value =
          flight * 0.26 * smoothVigor.current;
      }
  });
  return (
    <group ref={root}>
      <primitive object={rig.scene} />
      <mesh
        ref={blurL}
        position={[0.55, 0.16, -0.08]}
        rotation={[-0.15, -0.25, 0]}
        scale={[0.57, 0.09, 0.38]}
      >
        <sphereGeometry args={[1, 32, 16]} />
        <WingBlurMaterial />
      </mesh>
      <mesh
        ref={blurR}
        position={[-0.55, 0.16, -0.08]}
        rotation={[-0.15, 0.25, 0]}
        scale={[0.57, 0.09, 0.38]}
      >
        <sphereGeometry args={[1, 32, 16]} />
        <WingBlurMaterial />
      </mesh>
    </group>
  );
}

function WingBlurMaterial() {
  const uniforms = useMemo(() => ({ opacity: { value: 0.2 } }), []);
  return (
    <shaderMaterial
      transparent
      depthWrite={false}
      uniforms={uniforms}
      vertexShader={`varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);vLocal=position;gl_Position=projectionMatrix*p;}`}
      fragmentShader={`uniform float opacity; varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main(){float rim=pow(abs(dot(normalize(vNormal),normalize(vView))),1.6);float fade=1.0-smoothstep(.15,1.0,length(vLocal.xz));gl_FragColor=vec4(.83,.92,.85,opacity*rim*fade);}`}
    />
  );
}
