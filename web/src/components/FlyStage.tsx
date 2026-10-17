'use client';
/* oxlint-disable react/react-compiler -- R3F camera/vector mutation is imperative; the mounted flag deliberately gates WebGL after hydration. */

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Preload, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ActionDirector } from '../interaction/director';
import { nectarPosition } from '../interaction/world';
import { Habitat } from '../scene/Habitat';
import { FlyModel } from '../scene/FlyModel';

export type Quality = 'auto' | 'high' | 'low';
const HOME_CAMERA: [number, number, number] = [0.6, 3.3, 6.7];
const HOME_TARGET: [number, number, number] = [-1.3, 1.2, 0.5];
interface Props {
  director: ActionDirector;
  quality: Quality;
  cameraKey: number;
  reducedMotion: boolean;
  vigor: number;
  bubbleRef: RefObject<HTMLDivElement | null>;
  onMetrics?: (metrics: { fps: number; calls: number; low: boolean }) => void;
}

class SceneBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: string }
> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="scene-fallback">
        <span className="eyebrow">HABITAT UNAVAILABLE</span>
        <h2>A little trouble taking flight.</h2>
        <p>{this.state.error}</p>
        <button className="primary-button" onClick={this.props.onRetry}>
          Try the habitat again
        </button>
        <small>Your manual controls and neural data are still available.</small>
      </div>
    ) : (
      this.props.children
    );
  }
}

function Nectar({ director }: { director: ActionDirector }) {
  const bead = useRef<THREE.Group>(null),
    ghost = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const nectar = director.snapshot.nectar;
    if (!bead.current || !ghost.current) return;
    bead.current.visible = !!nectar && nectar.amount > 0.01;
    ghost.current.visible = !!nectar && !nectar.committed;
    if (!nectar) return;
    bead.current.position.set(...nectar.position);
    bead.current.scale.setScalar(Math.max(0.001, Math.cbrt(nectar.amount)));
    ghost.current.position.set(...nectarPosition(nectar.perchId));
    if (halo.current)
      halo.current.scale.setScalar(
        1 + Math.sin(director.snapshot.time / 350) * 0.08,
      );
  });
  return (
    <>
      <group ref={bead} visible={false}>
        <mesh>
          <sphereGeometry args={[0.09, 24, 16]} />
          <meshPhysicalMaterial
            color="#ffcf72"
            roughness={0.12}
            metalness={0.08}
            clearcoat={1}
            emissive="#f3a532"
            emissiveIntensity={0.6}
          />
        </mesh>
        <pointLight color="#ffd17e" intensity={0.5} distance={1.5} />
        <mesh scale={1.7}>
          <sphereGeometry args={[0.09, 16, 12]} />
          <meshBasicMaterial
            color="#ffd182"
            transparent
            opacity={0.1}
            depthWrite={false}
          />
        </mesh>
      </group>
      <group ref={ghost} visible={false}>
        <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.2, 48]} />
          <meshBasicMaterial
            color="#f7d994"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.065, 16, 10]} />
          <meshBasicMaterial color="#ffe5a5" transparent opacity={0.35} />
        </mesh>
      </group>
    </>
  );
}

function SceneRuntime({
  director,
  cameraKey,
  bubbleRef,
  reducedMotion,
  onMetrics,
  low,
  onSlow,
}: {
  director: ActionDirector;
  cameraKey: number;
  bubbleRef: Props['bubbleRef'];
  reducedMotion: boolean;
  onMetrics?: Props['onMetrics'];
  low: boolean;
  onSlow: () => void;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, gl } = useThree();
  const point = useMemo(() => new THREE.Vector3(), []);
  const camPosition = useMemo(() => new THREE.Vector3(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const metrics = useRef({ frames: 0, elapsed: 0, slow: 0 });
  const wasDemo = useRef(false);
  const narrow = size.width < 760;
  useEffect(() => {
    camera.position.set(...HOME_CAMERA);
    controls.current?.target.set(...HOME_TARGET);
    controls.current?.update();
  }, [camera, cameraKey]);
  useFrame((_, dt) => {
    const s = director.snapshot;
    if (controls.current) {
      controls.current.enabled = s.phase !== 'offering' && !s.demo;
      if (s.demo && !reducedMotion) {
        const close = s.phase === 'feeding' || s.phase === 'grooming';
        camTarget.set(...s.pose.position);
        camTarget.y -= 0.1;
        camPosition
          .copy(camTarget)
          .add(
            new THREE.Vector3(
              close ? 1.7 : 3.4,
              close ? 1.15 : 2.1,
              close ? 3.3 : 6.3,
            ),
          );
        camera.position.lerp(camPosition, 1 - Math.exp(-dt * 1.5));
        controls.current.target.lerp(camTarget, 1 - Math.exp(-dt * 1.5));
        controls.current.update();
      } else if (wasDemo.current) {
        camera.position.set(...HOME_CAMERA);
        controls.current.target.set(...HOME_TARGET);
        controls.current.update();
      } else if (!reducedMotion && s.phase !== 'offering') {
        point.set(...s.pose.position).project(camera);
        if (narrow || Math.abs(point.x) > 0.55) {
          // Keep the creature in frame without removing approach's depth change.
          const shift =
            (s.pose.position[0] +
              (narrow ? 0 : 0.35) -
              controls.current.target.x) *
            (1 - Math.exp(-dt * 1.8));
          camera.position.x += shift;
          controls.current.target.x += shift;
          controls.current.update();
        }
      }
    }
    wasDemo.current = s.demo;
    if (bubbleRef.current) {
      point
        .set(s.pose.position[0], s.pose.position[1] + 0.35, s.pose.position[2])
        .project(camera);
      const x = (point.x * 0.5 + 0.5) * size.width,
        y = (-point.y * 0.5 + 0.5) * size.height;
      const bubbleWidth = Math.min(narrow ? 220 : 270, size.width - 32);
      const left = Math.max(
        16,
        Math.min(
          size.width - bubbleWidth - 16,
          x + (x > size.width * 0.62 ? -bubbleWidth - 32 : 35),
        ),
      );
      const top = Math.max(110, Math.min(size.height - 190, y - 105));
      bubbleRef.current.style.left = `${left}px`;
      bubbleRef.current.style.top = `${top}px`;
      bubbleRef.current.style.setProperty(
        '--tail-x',
        `${Math.max(20, Math.min(bubbleWidth - 20, x - left))}px`,
      );
      bubbleRef.current.style.visibility = point.z < 1 ? 'visible' : 'hidden';
    }
    metrics.current.frames++;
    metrics.current.elapsed += dt;
    if (metrics.current.elapsed >= 2) {
      const fps = Math.round(metrics.current.frames / metrics.current.elapsed);
      onMetrics?.({ fps, calls: gl.info.render.calls, low });
      if (fps < 35) metrics.current.slow++;
      else metrics.current.slow = 0;
      if (metrics.current.slow >= 3) onSlow();
      metrics.current.frames = 0;
      metrics.current.elapsed = 0;
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={HOME_TARGET}
      enablePan={false}
      minDistance={4.4}
      maxDistance={11}
      minPolarAngle={0.5}
      maxPolarAngle={1.43}
      minAzimuthAngle={-0.6}
      maxAzimuthAngle={0.95}
      enableDamping
      dampingFactor={0.07}
    />
  );
}

function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export function FlyStage(props: Props) {
  const [mounted, setMounted] = useState(false),
    [attempt, setAttempt] = useState(0),
    [autoLow, setAutoLow] = useState(false),
    [lost, setLost] = useState(false),
    [sceneReady, setSceneReady] = useState(false);
  useEffect(() => setMounted(true), []);
  const low = props.quality === 'low' || (props.quality === 'auto' && autoLow);
  const retry = () => {
    useGLTF.clear('/models/fly/fly-high.glb');
    useGLTF.clear('/models/fly/fly-low.glb');
    setLost(false);
    setSceneReady(false);
    setAttempt((n) => n + 1);
  };
  return (
    <div
      className="habitat-canvas"
      data-quality={low ? 'low' : 'high'}
      data-scene-ready={sceneReady}
    >
      {!mounted ? (
        <div className="scene-loading">
          <span className="loading-orbit" />
          Preparing a tiny world…
        </div>
      ) : (
        <SceneBoundary key={attempt} onRetry={retry}>
          {lost ? (
            <div className="scene-fallback">
              <h2>The habitat needs a moment.</h2>
              <p>The graphics connection was interrupted.</p>
              <button className="primary-button" onClick={retry}>
                Restore habitat
              </button>
            </div>
          ) : (
            <Canvas
              shadows="percentage"
              dpr={low ? 1 : [1, 1.5]}
              camera={{ position: HOME_CAMERA, fov: 34, near: 0.05, far: 60 }}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance',
              }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
                gl.domElement.addEventListener(
                  'webglcontextlost',
                  (e) => {
                    e.preventDefault();
                    setLost(true);
                  },
                  { once: true },
                );
              }}
              fallback={
                <div className="scene-fallback">
                  <h2>This habitat needs WebGL2.</h2>
                  <p>Try Chrome or Edge with hardware acceleration enabled.</p>
                  <button onClick={retry}>Try again</button>
                </div>
              }
            >
              <Suspense fallback={null}>
                <Habitat low={low} />
                <FlyModel
                  director={props.director}
                  low={low}
                  vigor={props.vigor}
                />
                <Nectar director={props.director} />
                {/* Compile hidden nectar and flight materials before interaction. */}
                <Preload all />
                <SceneReady onReady={() => setSceneReady(true)} />
              </Suspense>
              <SceneRuntime
                {...props}
                low={low}
                onSlow={() => setAutoLow(true)}
              />
            </Canvas>
          )}
        </SceneBoundary>
      )}
      {mounted && !sceneReady && !lost && (
        <div className="scene-loading">
          <span className="loading-orbit" />
          Waking our smallest resident…
        </div>
      )}
      <div className="scene-vignette" />
    </div>
  );
}
