import { DEMO_DURATION_MS, DEMO_EVENTS } from '../interaction/replay';
import { SIMULATION_STEP_MS } from './clock';
import type { Simulation } from './engine';
import { STIMULI } from './stimuli';
import { GESTURES, type Gesture } from './types';

const NEURAL_EVENTS = DEMO_EVENTS.filter(
  (event) =>
    event.phase === 'start' &&
    (GESTURES as readonly string[]).includes(event.intent),
);

/** Replay genuine graph dynamics on the same timeline as the action director.
 * Cues enter at the first fixed-step boundary at or after their event time.
 * Nectar and spectacle remain authored and inject no invented neural stimulus.
 */
export class SimulationPlayback {
  private nextEvent = 0;
  private targetTime = 0;

  constructor(
    private readonly simulation: Pick<
      Simulation,
      'time' | 'reset' | 'stimulate' | 'step'
    >,
  ) {
    simulation.reset();
  }

  advance(timeMs: number): number {
    if (!Number.isFinite(timeMs) || timeMs < this.targetTime) return 0;
    this.targetTime = Math.max(0, Math.min(DEMO_DURATION_MS, timeMs));
    let steps = 0;
    while (
      this.simulation.time + SIMULATION_STEP_MS <=
      this.targetTime + 1e-6
    ) {
      this.applyDueEvents();
      this.simulation.step();
      steps++;
    }
    this.applyDueEvents();
    return steps;
  }

  private applyDueEvents(): void {
    while (
      this.nextEvent < NEURAL_EVENTS.length &&
      NEURAL_EVENTS[this.nextEvent].time <= this.simulation.time
    ) {
      const event = NEURAL_EVENTS[this.nextEvent++];
      this.simulation.stimulate(STIMULI[event.intent as Gesture]);
    }
  }
}
