'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Simulation } from '../simulation/engine';
import { loadGraph } from '../simulation/graph';
import { STIMULI } from '../simulation/stimuli';
import type { GestureEvent, Graph, SimulationSnapshot } from '../simulation/types';

export function useSimulation() {
  const simRef = useRef<Simulation | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    setReady(false);
    setError('');
    setGraph(null);
    setSnapshot(null);

    loadGraph()
      .then(result => {
        if (cancelled) return;
        setGraph(result);
        const sim = new Simulation(result);
        simRef.current = sim;
        setReady(true);
        setSnapshot(sim.snapshot(0));

        let ticks = 0;
        timer = setInterval(() => {
          if (cancelled || !simRef.current) return;
          const start = performance.now();
          simRef.current.step();
          ticks++;
          if (ticks % 3 === 0) {
            setSnapshot(simRef.current.snapshot(performance.now() - start));
          }
        }, 20);
      })
      .catch(problem => {
        if (!cancelled) {
          setError(problem instanceof Error ? problem.message : 'Graph could not load');
        }
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      simRef.current = null;
    };
  }, [attempt]);

  const stimulate = useCallback(
    (event: GestureEvent) => {
      if (ready && simRef.current) {
        const stim = STIMULI[event.gesture];
        if (stim) simRef.current.stimulate(stim);
      }
    },
    [ready]
  );

  const reset = useCallback(() => {
    if (simRef.current) {
      simRef.current.reset();
      setSnapshot(simRef.current.snapshot(0));
    }
  }, []);

  return { graph, snapshot, ready, error, stimulate, reset, retry: () => setAttempt(value => value + 1) };
}
