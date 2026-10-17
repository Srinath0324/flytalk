import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';
const bytes = await readFile('public/models/fly/fly-high.glb');
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
for (const angle of [1.2, 0, -0.7, -1.2]) {
  const node = gltf.scene.getObjectByName('wing_left');
  node.rotation.y = angle;
  gltf.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(node);
  console.log(
    'WING',
    angle,
    box.getCenter(new Vector3()).toArray(),
    box.getSize(new Vector3()).toArray(),
  );
}
for (const name of [
  'rostrum',
  'haustellum',
  'labrum_left',
  'wing_left',
  'head',
])
  console.log(
    name,
    gltf.scene.getObjectByName(name).getWorldPosition(new Vector3()).toArray(),
  );
