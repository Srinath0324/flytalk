import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, MODEL_VERSION } from '../src/simulation/engine';
import { SimulationClock, MAX_CATCHUP_STEPS } from '../src/simulation/clock';
import { readGraph } from '../src/simulation/node-graph';
import { validateGraph } from '../src/simulation/graph';
import { STIMULI } from '../src/simulation/stimuli';
import { GESTURES } from '../src/simulation/types';

const graph = readGraph();

void test('bundled graph has verified provenance and calibration agrees with the running model', () => {
  assert.equal(graph.manifest.neuronCount, 5000);
  assert.equal(graph.manifest.edgeCount, 149588);
  assert.equal(graph.manifest.synapseCount, 4346627);
  assert.equal(graph.manifest.calibration?.model, MODEL_VERSION);
  assert.deepEqual(Object.keys(STIMULI), [...GESTURES]);
  const wrong = {
    ...graph,
    manifest: {
      ...graph.manifest,
      calibration: { ...graph.manifest.calibration!, model: 'wrong' },
    },
  };
  assert.throws(() => validateGraph(wrong), /calibration does not match/);
});

void test('fixed-step worker clock matches direct stepping under uneven frame delivery', () => {
  const reference = new Simulation(graph),
    scheduled = new Simulation(graph);
  reference.stimulate(STIMULI.COME);
  scheduled.stimulate(STIMULI.COME);
  for (let i = 0; i < 250; i++) reference.step();
  const clock = new SimulationClock(scheduled);
  clock.advance(0);
  let time = 0;
  const delivery = [17, 33, 9, 21, 40];
  for (let i = 0; time < 5000; i++) {
    time = Math.min(5000, time + delivery[i % delivery.length]);
    clock.advance(time);
  }
  assert.equal(scheduled.time, reference.time);
  assert.deepEqual(scheduled.activity, reference.activity);
  assert.deepEqual(scheduled.decoder.state, reference.decoder.state);
});

void test('clock bounds catch-up and discards suspended elapsed time', () => {
  let ticks = 0;
  const clock = new SimulationClock({
    step() {
      ticks++;
    },
  });
  clock.advance(0);
  assert.equal(clock.advance(60_000), MAX_CATCHUP_STEPS);
  assert.equal(ticks, MAX_CATCHUP_STEPS);
  clock.reset();
  clock.advance(120_000);
  assert.equal(ticks, MAX_CATCHUP_STEPS);
  assert.equal(clock.advance(120_020), 1);
});

void test('compact telemetry contains genuine scores without transferring live activity buffers', () => {
  const simulation = new Simulation(graph);
  simulation.stimulate(STIMULI.POINT_LEFT);
  for (let i = 0; i < 50; i++) simulation.step();
  const compact = simulation.snapshot(0, false),
    detailed = simulation.snapshot(0, true);
  assert.equal(compact.activity.length, 0);
  assert.equal(detailed.activity.length, graph.manifest.neuronCount);
  assert.notEqual(detailed.activity.buffer, simulation.activity.buffer);
  assert.deepEqual(compact.rawScores, detailed.rawScores);
  assert.deepEqual(compact.scores, detailed.scores);
  detailed.activity.fill(0);
  assert.ok(simulation.activity.some((value) => value > 0));
});

void test('scientific baseline preserves the observed COME retreat instead of fabricating approach', () => {
  const simulation = new Simulation(graph);
  simulation.stimulate(STIMULI.COME);
  const states = new Set<string>();
  for (let i = 0; i < 250; i++) {
    simulation.step();
    states.add(simulation.decoder.state.state);
  }
  assert.ok(states.has('RETREAT'));
  assert.equal(states.has('APPROACH'), false);
  assert.ok(states.has('IDLE'));
});

void test('stimulus withdrawal decays real activity; reset clears model and decoder', () => {
  const simulation = new Simulation(graph);
  simulation.stimulate(STIMULI.MIDDLE_FINGER);
  for (let i = 0; i < 25; i++) simulation.step();
  const before = simulation.rawScores().escape;
  simulation.stimulate(STIMULI.STOP);
  simulation.step();
  assert.ok(simulation.activity.some((value) => value > 0));
  for (let i = 0; i < 250; i++) simulation.step();
  assert.ok(simulation.rawScores().escape < before * 0.001);
  simulation.reset();
  assert.equal(simulation.time, 0);
  assert.equal(simulation.decoder.state.state, 'IDLE');
  assert.ok(simulation.activity.every((value) => value === 0));
});

void test('reset restores exact fresh-model behavior after a different stimulus history', () => {
  const used = new Simulation(graph),
    fresh = new Simulation(graph);
  used.stimulate(STIMULI.MIDDLE_FINGER);
  for (let i = 0; i < 64; i++) used.step();
  used.stimulate(STIMULI.POINT_RIGHT);
  for (let i = 0; i < 33; i++) used.step();
  used.reset();
  used.stimulate(STIMULI.WAVE);
  fresh.stimulate(STIMULI.WAVE);
  for (let i = 0; i < 100; i++) {
    used.step();
    fresh.step();
  }
  assert.deepEqual(used.activity, fresh.activity);
  assert.deepEqual(used.snapshot(), fresh.snapshot());
});

void test('all retained stimulus mappings yield finite actual telemetry with bounded calibrated drive', () => {
  for (const gesture of GESTURES) {
    const simulation = new Simulation(graph);
    simulation.stimulate(STIMULI[gesture]);
    for (let tick = 0; tick < 100; tick++) simulation.step();
    const snapshot = simulation.snapshot(0, false);
    assert.ok(
      Object.values(snapshot.rawScores).every(
        (value) => Number.isFinite(value) && value >= 0,
      ),
    );
    assert.ok(
      Object.values(snapshot.scores).every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    );
    assert.ok(
      snapshot.activeNeurons >= 0 &&
        snapshot.activeNeurons <= graph.manifest.neuronCount,
    );
    assert.equal(snapshot.time, 2000);
    assert.equal(snapshot.activity.length, 0);
  }
});
