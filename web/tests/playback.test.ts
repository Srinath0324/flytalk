import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation/engine';
import { SimulationPlayback } from '../src/simulation/playback';
import { readGraph } from '../src/simulation/node-graph';
import { DEMO_DURATION_MS } from '../src/interaction/replay';
import { nearestPerch, targetToWorld } from '../src/interaction/world';

void test('genuine neural replay is identical across render rates and late initialization', () => {
  const graph = readGraph(),
    smooth = new Simulation(graph),
    late = new Simulation(graph);
  const a = new SimulationPlayback(smooth),
    b = new SimulationPlayback(late);
  for (let time = 0; time < DEMO_DURATION_MS; time += 1000 / 60)
    a.advance(time);
  a.advance(DEMO_DURATION_MS);
  b.advance(DEMO_DURATION_MS);
  assert.equal(smooth.time, DEMO_DURATION_MS);
  assert.deepEqual(smooth.snapshot(), late.snapshot());
  assert.deepEqual(smooth.activity, late.activity);
  assert.equal(b.advance(10), 0);
  assert.equal(b.advance(NaN), 0);
});

void test('playback only injects the original attention and approach cues', () => {
  let time = 0,
    resets = 0;
  const cues: unknown[] = [];
  const playback = new SimulationPlayback({
    get time() {
      return time;
    },
    reset() {
      time = 0;
      resets++;
    },
    step() {
      time += 20;
    },
    stimulate(cue) {
      cues.push(cue);
    },
  });
  playback.advance(400);
  assert.equal(cues.length, 1);
  playback.advance(28_000);
  assert.equal(cues.length, 1);
  playback.advance(35_000);
  assert.equal(cues.length, 2);
  assert.equal(resets, 1);
});

void test('every feeding perch is reachable through the bounded manual interaction plane', () => {
  const reachable = new Set<string>();
  for (let x = 0.05; x <= 0.95; x += 0.05)
    for (let y = 0.05; y <= 0.95; y += 0.05)
      reachable.add(nearestPerch(targetToWorld({ x, y })).id);
  assert.deepEqual([...reachable].sort(), ['fruit', 'leaf', 'stone']);
});
