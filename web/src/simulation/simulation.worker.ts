import { Simulation } from './engine';
import { SimulationClock } from './clock';
import { loadGraph } from './graph';
import { STIMULI } from './stimuli';
import { SimulationPlayback } from './playback';
import type {
  PlaybackState,
  SimulationRequest,
  SimulationResponse,
} from './protocol';

let simulation: Simulation | undefined;
let clock: SimulationClock | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let paused = false;
let detailed = false;
let lastSnapshot = 0;
let generation = 0;
let playback: PlaybackState = { active: false, generation: -1, timeMs: 0 };
let playbackStepper: SimulationPlayback | undefined;
const post = (message: SimulationResponse) => {
  if (message.type === 'ready' || message.type === 'snapshot')
    self.postMessage(message, { transfer: [message.snapshot.activity.buffer] });
  else self.postMessage(message);
};
const fail = (error: unknown) => {
  clearInterval(timer);
  post({
    type: 'error',
    message:
      error instanceof Error ? error.message : 'Neural simulation unavailable.',
  });
};
const publish = (stepMs = 0) => {
  if (simulation)
    post({
      type: 'snapshot',
      snapshot: simulation.snapshot(stepMs, detailed),
      playbackGeneration: playback.generation,
    });
};
const advancePlayback = () => {
  if (!playback.active || !playbackStepper) return;
  const start = performance.now();
  const steps = playbackStepper.advance(playback.timeMs);
  if (steps && start - lastSnapshot >= 100) {
    lastSnapshot = start;
    publish((performance.now() - start) / steps);
  }
};

self.onmessage = async (event: MessageEvent<SimulationRequest>) => {
  try {
    const message = event.data;
    if (message.type === 'init') {
      const ticket = ++generation;
      clearInterval(timer);
      simulation = undefined;
      clock = undefined;
      playbackStepper = undefined;
      paused = message.paused;
      detailed = message.detailed;
      playback = { ...message.playback };
      // A newer initialization owns the worker if graph loading is retried.
      const graph = await loadGraph().catch((error) => {
        if (ticket === generation) fail(error);
        return null;
      });
      if (ticket !== generation) return;
      if (!graph) return;
      simulation = new Simulation(graph);
      clock = new SimulationClock(simulation);
      lastSnapshot = performance.now();
      clock.advance(lastSnapshot);
      if (playback.active) {
        playbackStepper = new SimulationPlayback(simulation);
        playbackStepper.advance(playback.timeMs);
      }
      post({
        type: 'ready',
        manifest: graph.manifest,
        snapshot: simulation.snapshot(0, detailed),
        playbackGeneration: playback.generation,
      });
      timer = setInterval(() => {
        try {
          if (!simulation || !clock || paused || playback.active) return;
          const start = performance.now();
          const steps = clock.advance(start);
          const duration = steps ? (performance.now() - start) / steps : 0;
          if (start - lastSnapshot >= 100) {
            lastSnapshot = start;
            publish(duration);
          }
        } catch (error) {
          fail(error);
        }
      }, 20);
    } else if (message.type === 'gesture') {
      if (playback.active) return;
      const stimulus = STIMULI[message.event.gesture];
      if (!stimulus) throw new Error('Unknown neural stimulus.');
      simulation?.stimulate(stimulus);
    } else if (message.type === 'reset') {
      playback.active = false;
      playback.timeMs = 0;
      playbackStepper = undefined;
      simulation?.reset();
      clock?.reset();
      publish();
    } else if (message.type === 'playback') {
      if (message.generation <= playback.generation) return;
      playback = {
        active: message.active,
        generation: message.generation,
        timeMs: 0,
      };
      playbackStepper =
        message.active && simulation
          ? new SimulationPlayback(simulation)
          : undefined;
      clock?.reset();
      publish();
    } else if (message.type === 'advance-playback') {
      if (
        !playback.active ||
        message.generation !== playback.generation ||
        !Number.isFinite(message.timeMs)
      )
        return;
      playback.timeMs = Math.max(playback.timeMs, message.timeMs);
      advancePlayback();
    } else if (message.type === 'visibility') {
      paused = message.paused;
      clock?.reset();
    } else if (message.type === 'detail') {
      detailed = message.enabled;
      publish();
    }
  } catch (error) {
    fail(error);
  }
};
