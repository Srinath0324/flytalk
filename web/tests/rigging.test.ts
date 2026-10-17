import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  LEG_JOINTS,
  footTarget,
  solveJointChain,
  createIKScratch,
} from '../src/scene/rigging';
import { PERCHES, restingPosition } from '../src/interaction/world';

void test('exported anatomy can establish six foot contacts on each authored perch, including a feeding lean', async () => {
  for (const detail of ['high', 'low']) {
    const bytes = await readFile(`public/models/fly/fly-${detail}.glb`);
    const asset = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    asset.scene.updateMatrixWorld(true);
    const rest = LEG_JOINTS.map((leg) =>
      asset.scene
        .getObjectByName(leg.tip)!
        .getWorldPosition(new THREE.Vector3()),
    );
    for (const perch of PERCHES)
      for (const pitch of [0, 0.21]) {
        const root = new THREE.Group();
        const model = asset.scene.clone(true);
        root.add(model);
        const nodes: Record<string, THREE.Object3D> = {};
        model.traverse((node) => {
          nodes[node.name] = node;
        });
        root.position.set(...restingPosition(perch.id));
        root.rotation.set(pitch, perch.yaw, 0, 'YXZ');
        root.updateMatrixWorld(true);
        for (const [i, leg] of LEG_JOINTS.entries()) {
          const target = footTarget(
            perch.id,
            restingPosition(perch.id),
            perch.yaw,
            rest[i],
            new THREE.Vector3(),
          );
          solveJointChain(
            nodes,
            [leg.hip, leg.femur, leg.tibia, leg.foot],
            leg.tip,
            target,
            createIKScratch(),
          );
          const error = nodes[leg.tip]
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(target);
          assert.ok(
            error < 0.02,
            `${detail} ${perch.id} pitch ${pitch} ${leg.tip}: ${error.toFixed(4)} contact error`,
          );
        }
      }
  }
});
