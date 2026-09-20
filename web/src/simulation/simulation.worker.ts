import { Simulation } from './engine';
import { STIMULI } from './stimuli';
import type { GestureEvent, Graph } from './types';

let simulation: Simulation | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let ticks = 0;
self.onmessage = (event: MessageEvent<{ type: 'init'; graph: Graph } | { type: 'gesture'; event: GestureEvent } | { type: 'reset' }>) => {
  try {
    const message = event.data;
    if (message.type === 'init') {
      clearInterval(timer);
      simulation = new Simulation(message.graph);
      self.postMessage({ type: 'ready' });
      timer = setInterval(() => {
        if (!simulation) return;
        const start = performance.now();
        simulation.step();
        if (++ticks % 3 === 0) {
          const snapshot = simulation.snapshot(performance.now() - start);
          self.postMessage({ type: 'snapshot', snapshot }, { transfer: [snapshot.activity.buffer] });
        }
      }, 20);
    } else if (message.type === 'gesture') {
      const stimulus = STIMULI[message.event.gesture];
      if (!stimulus) throw new Error('Unknown stimulus');
      simulation?.stimulate(stimulus);
    } else if (message.type === 'reset') simulation?.reset();
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Simulation failed' }); }
};
