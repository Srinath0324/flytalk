'use client';
/* oxlint-disable react/react-compiler -- Worker initialization resets UI state in an effect; telemetry arrives through external callbacks. */

import { useCallback, useEffect, useRef, useState } from 'react';
// oxlint-disable-next-line import/default -- Vite supplies the constructor for ?worker imports.
import SimulationWorker from '../simulation/simulation.worker?worker';
import type {
  PlaybackState,
  SimulationRequest,
  SimulationResponse,
} from '../simulation/protocol';
import type {
  GestureEvent,
  Manifest,
  SimulationSnapshot,
} from '../simulation/types';

export function useSimulation() {
  const workerRef = useRef<Worker | null>(null);
  const detailedRef = useRef(false);
  const readyRef = useRef(false);
  const playbackRef = useRef<PlaybackState>({
    active: false,
    generation: 0,
    timeMs: 0,
  });
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const send = useCallback((message: SimulationRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setReady(false);
    setError('');
    setManifest(null);
    setSnapshot(null);
    let worker: Worker;
    try {
      worker = new SimulationWorker();
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : 'Workers are unavailable.',
      );
      return;
    }
    workerRef.current = worker;
    const fail = (message: string) => {
      if (cancelled) return;
      readyRef.current = false;
      setReady(false);
      setError(message);
      setSnapshot(null);
    };
    worker.onmessage = ({ data }: MessageEvent<SimulationResponse>) => {
      if (cancelled) return;
      if (data.type === 'ready') {
        readyRef.current = true;
        setReady(true);
        setManifest(data.manifest);
        if (data.playbackGeneration === playbackRef.current.generation)
          setSnapshot(data.snapshot);
      } else if (data.type === 'snapshot') {
        if (data.playbackGeneration === playbackRef.current.generation)
          setSnapshot(data.snapshot);
      } else fail(data.message);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(event.message || 'Neural worker could not start.');
    };
    worker.onmessageerror = () =>
      fail('Neural worker returned an unreadable message.');
    const visibility = () =>
      worker.postMessage({
        type: 'visibility',
        paused: document.hidden,
      } satisfies SimulationRequest);
    document.addEventListener('visibilitychange', visibility);
    worker.postMessage({
      type: 'init',
      paused: document.hidden,
      detailed: detailedRef.current,
      playback: { ...playbackRef.current },
    } satisfies SimulationRequest);
    return () => {
      cancelled = true;
      readyRef.current = false;
      document.removeEventListener('visibilitychange', visibility);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [attempt]);

  const stimulate = useCallback(
    (event: GestureEvent) => {
      if (readyRef.current && !playbackRef.current.active)
        send({ type: 'gesture', event });
    },
    [send],
  );
  const setPlayback = useCallback(
    (active: boolean) => {
      const generation = playbackRef.current.generation + 1;
      playbackRef.current = { active, generation, timeMs: 0 };
      send({ type: 'playback', active, generation });
    },
    [send],
  );
  const advancePlayback = useCallback(
    (timeMs: number) => {
      const playback = playbackRef.current;
      if (
        !playback.active ||
        !Number.isFinite(timeMs) ||
        timeMs < playback.timeMs
      )
        return;
      playback.timeMs = timeMs;
      send({
        type: 'advance-playback',
        timeMs,
        generation: playback.generation,
      });
    },
    [send],
  );
  const reset = useCallback(() => {
    setPlayback(false);
    send({ type: 'reset' });
  }, [send, setPlayback]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const setDetailed = useCallback(
    (enabled: boolean) => {
      detailedRef.current = enabled;
      send({ type: 'detail', enabled });
    },
    [send],
  );
  return {
    manifest,
    snapshot,
    ready,
    error,
    stimulate,
    reset,
    retry,
    setDetailed,
    setPlayback,
    advancePlayback,
  };
}
