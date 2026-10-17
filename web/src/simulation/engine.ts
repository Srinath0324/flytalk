import { CHANNELS, emptyScores, type Behavior, type BehaviorResult, type Channel, type Graph, type Scores, type SimulationSnapshot, type Stimulus } from './types';

const STATES: Record<Channel, Behavior> = { escape: 'ESCAPE', retreat: 'RETREAT', left: 'MOVE_LEFT', right: 'MOVE_RIGHT', approach: 'APPROACH' };
const MOVING = new Set<Behavior>(['ESCAPE', 'RETREAT', 'MOVE_LEFT', 'MOVE_RIGHT', 'APPROACH']);
export const MODEL_VERSION = 'nonnegative-v1:dt20:leak0.5:gain0.85';

export class Decoder {
  state: BehaviorResult = { state: 'IDLE', strength: 0 };
  private candidate: Behavior = 'IDLE';
  private candidateSince = 0;
  private stoppedAt = -Infinity;

  reset() { this.state = { state: 'IDLE', strength: 0 }; this.candidate = 'IDLE'; this.candidateSince = 0; this.stoppedAt = -Infinity; }

  update(scores: Scores, stimulusActive: boolean, now: number): BehaviorResult {
    const ranked = CHANNELS.map(channel => ({ channel, value: scores[channel] })).sort((a, b) => b.value - a.value);
    let desired: Behavior;
    const strength = ranked[0].value;
    if (scores.escape >= 0.2 && scores.escape >= ranked[0].value - 0.1) desired = 'ESCAPE';
    else if (ranked[0].value >= 0.2 && ranked[0].value - ranked[1].value >= 0.1) desired = STATES[ranked[0].channel];
    else if (ranked[0].value >= 0.2 || stimulusActive) desired = 'CONFUSED';
    else if (MOVING.has(this.state.state) || (this.state.state === 'STOP' && now - this.stoppedAt < 1000)) desired = 'STOP';
    else desired = 'IDLE';
    if (desired !== this.candidate) { this.candidate = desired; this.candidateSince = now; }
    if (desired !== this.state.state && now - this.candidateSince >= 150) {
      if (desired === 'STOP') this.stoppedAt = now;
      this.state = { state: desired, strength };
    } else this.state = { ...this.state, strength };
    return this.state;
  }
}

export class Simulation {
  activity: Float32Array;
  private next: Float32Array;
  private drive: Float32Array;
  private external: Float32Array;
  private stimulus: Stimulus = { label: 'NO STIMULUS', populations: {}, duration: 0 };
  private onset = 0;
  time = 0;
  readonly decoder = new Decoder();

  constructor(readonly graph: Graph) {
    this.activity = new Float32Array(graph.manifest.neuronCount);
    this.next = new Float32Array(this.activity.length);
    this.drive = new Float32Array(this.activity.length);
    this.external = new Float32Array(this.activity.length);
  }

  reset() { this.activity.fill(0); this.time = 0; this.onset = 0; this.stimulus = { label: 'NO STIMULUS', populations: {}, duration: 0 }; this.decoder.reset(); }
  stimulate(stimulus: Stimulus) { this.stimulus = stimulus; this.onset = this.time; }
  get stimulusActive() { return this.time - this.onset < this.stimulus.duration; }

  rawScores(): Scores {
    const mean = (name: string) => {
      const population = this.graph.manifest.populations[name] ?? [];
      return population.length ? population.reduce((sum, i) => sum + this.activity[i], 0) / population.length : 0;
    };
    const lateral = mean('DNa02_L') - mean('DNa02_R');
    return { escape: mean('DNp01'), retreat: mean('MDN'), left: Math.max(0, lateral), right: Math.max(0, -lateral), approach: mean('DNp09') };
  }

  scores(raw = this.rawScores()): Scores {
    const scores = emptyScores();
    for (const channel of CHANNELS) {
      const calibration = this.graph.manifest.calibration;
      const peak = calibration?.peaks[channel] ?? 0;
      scores[channel] = calibration?.available[channel] && peak > 0 ? Math.min(1, raw[channel] / peak) : 0;
    }
    return scores;
  }

  step() {
    this.drive.fill(0);
    this.external.fill(0);
    const { sources, targets, weights, manifest } = this.graph;
    for (let edge = 0; edge < sources.length; edge++) this.drive[targets[edge]] += weights[edge] * this.activity[sources[edge]];
    if (this.stimulusActive) {
      const side = Math.floor((this.time - this.onset) / 200) % 2 ? '_R' : '_L';
      for (const [population, amplitude] of Object.entries(this.stimulus.populations)) {
        if (this.stimulus.alternate && !population.endsWith(side)) continue;
        for (const i of manifest.populations[population] ?? []) this.external[i] = Math.max(this.external[i], amplitude);
      }
    }
    for (let i = 0; i < this.activity.length; i++) this.next[i] = 0.5 * this.activity[i] + 0.5 * Math.min(1, Math.max(0, 0.85 * this.drive[i] + this.external[i]));
    [this.activity, this.next] = [this.next, this.activity];
    this.time += 20;
    this.decoder.update(this.scores(), this.stimulusActive, this.time);
  }

  snapshot(stepMs = 0, detailed = true): SimulationSnapshot {
    const rawScores = this.rawScores();
    return {
      activity: detailed ? this.activity.slice() : new Float32Array(0), scores: this.scores(rawScores), rawScores,
      activeNeurons: this.activity.reduce((count, value) => count + Number(value >= 0.01), 0),
      behavior: { ...this.decoder.state }, stimulus: this.stimulusActive ? this.stimulus.label : this.stimulus.label === 'STIMULUS WITHDRAWN' ? this.stimulus.label : 'NO STIMULUS',
      stimulusActive: this.stimulusActive, time: this.time, stepMs,
    };
  }
}
