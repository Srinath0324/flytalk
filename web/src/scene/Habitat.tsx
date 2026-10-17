'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer, Sparkles } from '@react-three/drei';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function makeLeaf(length: number, width: number) {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rows = 40,
    columns = 16;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows,
      z = (t - 0.5) * length;
    const w = (Math.pow(Math.sin(t * Math.PI), 0.78) * width) / 2;
    for (let c = 0; c <= columns; c++) {
      const side = (c / columns) * 2 - 1;
      vertices.push(
        side * w,
        0.025 +
          Math.pow(Math.abs(side), 3) * 0.12 +
          Math.pow(Math.abs(t - 0.5) * 2, 4) * 0.09,
        z,
      );
      uvs.push(c / columns, t);
      if (r < rows && c < columns) {
        const a = r * (columns + 1) + c;
        indices.push(
          a,
          a + 1,
          a + columns + 1,
          a + 1,
          a + columns + 2,
          a + columns + 1,
        );
      }
    }
  }
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Vein({
  points,
  radius = 0.008,
}: {
  points: THREE.Vector3[];
  radius?: number;
}) {
  const geometry = useMemo(
    () =>
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        20,
        radius,
        5,
        false,
      ),
    [points, radius],
  );
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#a1ad60" roughness={0.64} />
    </mesh>
  );
}

function Leaf() {
  const geometry = useMemo(() => makeLeaf(2.55, 1.4), []);
  const veins = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const z = -0.95 + i * 0.25;
        return [-1, 1].map((sign) =>
          Array.from({ length: 9 }, (_, j) => {
            const side = (j / 8) * 0.9,
              lz = z + side * 0.18,
              t = (lz + 1.275) / 2.55,
              width = Math.pow(Math.sin(t * Math.PI), 0.78) * 0.7;
            return new THREE.Vector3(
              sign * width * side,
              0.031 + side ** 3 * 0.12 + (Math.abs(t - 0.5) * 2) ** 4 * 0.09,
              lz,
            );
          }),
        );
      }).flat(),
    [],
  );
  const leafTexture = useMemo(() => {
    const data = new Uint8Array(128 * 256 * 4);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 128; x++) {
        const ridge = Math.cos((x - 64) * 0.1) * 0.07,
          noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        const shade = 1 + ridge + (noise - Math.floor(noise) - 0.5) * 0.13,
          i = (y * 128 + x) * 4;
        data[i] = 83 * shade;
        data[i + 1] = 115 * shade;
        data[i + 2] = 54 * shade;
        data[i + 3] = 255;
      }
    const map = new THREE.DataTexture(data, 128, 256);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  }, []);
  const veinGeometry = useMemo(
    () =>
      mergeGeometries(
        veins.map(
          (points) =>
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(points),
              16,
              0.006,
              4,
              false,
            ),
        ),
      ),
    [veins],
  );
  return (
    <group position={[-1.65, 0.685, 0.65]} rotation={[0, 0.35, 0]}>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial
          map={leafTexture}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Vein
        points={[
          new THREE.Vector3(0, 0.04, -1.4),
          new THREE.Vector3(0, 0.04, 0),
          new THREE.Vector3(0, 0.12, 1.23),
        ]}
        radius={0.018}
      />
      <mesh geometry={veinGeometry}>
        <meshStandardMaterial color="#8ca653" roughness={0.8} />
      </mesh>
      <Vein
        points={[
          new THREE.Vector3(0, 0.04, -1.4),
          new THREE.Vector3(0.05, -0.1, -1.8),
          new THREE.Vector3(0.25, -0.68, -1.85),
        ]}
        radius={0.026}
      />
      <mesh position={[0.39, 0.11, 0.49]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.075, 16, 12]} />
        <meshPhysicalMaterial
          color="#b6d4a6"
          roughness={0.02}
          metalness={0.2}
          clearcoat={1}
        />
      </mesh>
      <mesh position={[-0.37, 0.09, -0.5]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.035, 12, 8]} />
        <meshPhysicalMaterial
          color="#b6d4a6"
          roughness={0.02}
          metalness={0.2}
          clearcoat={1}
        />
      </mesh>
    </group>
  );
}

function Peach() {
  const { flesh, face, texture } = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1.05, 0);
    shape.bezierCurveTo(-0.8, -0.85, 0.8, -0.85, 1.05, 0);
    shape.bezierCurveTo(0.75, 0.6, -0.75, 0.6, -1.05, 0);
    const pixels = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const dx = (x / 255 - 0.5) * 2,
          dy = (y / 255 - 0.5) * 2,
          r = Math.hypot(dx, dy),
          a = Math.atan2(dy, dx);
        const fibers =
          (Math.sin(a * 150 + r * 24) + Math.sin(a * 307 - r * 11)) * 0.025;
        const grain =
          ((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1) * 0.025;
        const blush = Math.exp(-r * r * 12) * 0.55 + Math.max(0, r - 0.8) * 0.7;
        const i = (y * 256 + x) * 4;
        pixels[i] = 240 + fibers * 200;
        pixels[i + 1] = (185 - blush * 120) * (1 + fibers + grain);
        pixels[i + 2] = 95 - blush * 65;
        pixels[i + 3] = 255;
      }
    const texture = new THREE.DataTexture(pixels, 256, 256);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const face = new THREE.ShapeGeometry(shape, 64);
    const uv = face.getAttribute('uv');
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) + 1.15) / 2.3, (uv.getY(i) + 0.9) / 1.6);
    return {
      flesh: new THREE.ExtrudeGeometry(shape, {
        depth: 0.24,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.1,
        bevelSegments: 6,
        steps: 1,
        curveSegments: 64,
      }),
      face,
      texture,
    };
  }, []);
  const skin = useMemo(
    () => new THREE.TorusGeometry(1, 0.025, 8, 80, Math.PI),
    [],
  );
  return (
    <group position={[1.65, 0.42, -0.1]} rotation={[-Math.PI / 2, 0, -0.4]}>
      <mesh geometry={flesh} receiveShadow castShadow>
        <meshStandardMaterial color="#cd754a" roughness={0.68} />
      </mesh>
      <mesh geometry={face} position={[0, 0, 0.361]} receiveShadow>
        <meshStandardMaterial map={texture} roughness={0.48} />
      </mesh>
      <mesh position={[0, -0.12, 0.363]} scale={[0.21, 0.26, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#9e5432" roughness={0.82} />
      </mesh>
      <mesh
        geometry={skin}
        rotation={[0, 0, Math.PI]}
        position={[0, 0, 0.28]}
        scale={[1, 0.62, 1]}
      >
        <meshStandardMaterial color="#cb6846" roughness={0.8} />
      </mesh>
    </group>
  );
}

export function Habitat({ low }: { low: boolean }) {
  const stones = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        x: Math.sin(i * 27.1) * 3.25,
        z: Math.cos(i * 14.7) * 2.7,
        scale: 0.05 + (i % 4) * 0.027,
      })),
    [],
  );
  const stonesRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    stones.forEach((s, i) => {
      transform.position.set(s.x, -0.02, s.z);
      transform.scale.set(s.scale, s.scale * 0.55, s.scale * 0.7);
      transform.updateMatrix();
      stonesRef.current?.setMatrixAt(i, transform.matrix);
    });
    if (stonesRef.current) stonesRef.current.instanceMatrix.needsUpdate = true;
  }, [stones]);
  return (
    <>
      <color attach="background" args={['#111b19']} />
      <fog attach="fog" args={['#111b19', 14, 30]} />
      <ambientLight intensity={0.5} color="#b5c9bb" />
      <directionalLight
        position={[-3, 7, 5]}
        intensity={3.2}
        color="#ffe3b8"
        castShadow
        shadow-mapSize={low ? [512, 512] : [1024, 1024]}
        shadow-radius={3}
        shadow-bias={-0.00025}
        shadow-normalBias={0.012}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <spotLight
        position={[4, 5, -4]}
        intensity={65}
        color="#a7d5cd"
        angle={0.65}
        penumbra={1}
        distance={18}
      />
      <pointLight
        position={[-3, 1.8, -3]}
        intensity={7}
        color="#d6a85f"
        distance={9}
      />
      <Environment frames={1} resolution={128}>
        <Lightformer
          intensity={3}
          color="#fff0d6"
          position={[-4, 6, 2]}
          scale={[5, 7, 1]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <Lightformer
          intensity={2}
          color="#c7e2d6"
          position={[4, 2, -4]}
          scale={[3, 6, 1]}
          rotation={[0, -Math.PI / 3, 0]}
        />
      </Environment>
      <mesh position={[0, -0.28, 0]} receiveShadow>
        <cylinderGeometry args={[4.6, 4.43, 0.4, 96]} />
        <meshStandardMaterial color="#131e19" roughness={0.65} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.065, 0]}
        receiveShadow
      >
        <circleGeometry args={[4.45, 96]} />
        <meshStandardMaterial color="#202c22" roughness={0.85} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <torusGeometry args={[4.5, 0.065, 12, 100]} />
        <meshStandardMaterial
          color="#647269"
          metalness={0.35}
          roughness={0.5}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
        receiveShadow
      >
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#111b19" roughness={1} />
      </mesh>
      <Leaf />
      <Peach />
      <mesh
        position={[0.1, 0.07, -1.55]}
        scale={[0.95, 0.25, 0.65]}
        receiveShadow
        castShadow
      >
        <sphereGeometry args={[1, 32, 20]} />
        <meshStandardMaterial color="#969481" roughness={0.9} />
      </mesh>
      <instancedMesh
        ref={stonesRef}
        args={[undefined, undefined, stones.length]}
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#60624b" roughness={1} />
      </instancedMesh>
      <Sparkles
        count={low ? 20 : 55}
        scale={[9, 5, 7]}
        position={[0, 2, 0]}
        size={1.5}
        speed={0.13}
        opacity={0.22}
        color="#ffe4b0"
      />
    </>
  );
}
