import type { Simulation } from './engine';

export const SIMULATION_STEP_MS = 20;
export const MAX_CATCHUP_STEPS = 5;

/** Same fixed-step model at every display refresh rate; suspended time is discarded. */
export class SimulationClock {
  private previous: number | null = null;
  private remainder = 0;
  constructor(private readonly simulation: Pick<Simulation, 'step'>) {}
  reset() {
    this.previous = null;
    this.remainder = 0;
  }
  advance(now: number): number {
    if (!Number.isFinite(now)) return 0;
    if (this.previous === null) {
      this.previous = now;
      return 0;
    }
    const elapsed = Math.max(0, now - this.previous);
    this.previous = now;
    this.remainder += Math.min(elapsed, SIMULATION_STEP_MS * MAX_CATCHUP_STEPS);
    let steps = 0;
    while (
      this.remainder + 1e-6 >= SIMULATION_STEP_MS &&
      steps < MAX_CATCHUP_STEPS
    ) {
      this.simulation.step();
      this.remainder -= SIMULATION_STEP_MS;
      steps++;
    }
    return steps;
  }
}
