import { writeFileSync } from 'node:fs';
import { Simulation, MODEL_VERSION } from '../src/simulation/engine';
import { STIMULI } from '../src/simulation/stimuli';
import { CHANNELS, GESTURES, emptyScores } from '../src/simulation/types';
import { readGraph } from '../src/simulation/node-graph';

const graph = readGraph(undefined, false);
const simulation = new Simulation(graph);
const peaks = emptyScores();
for (const gesture of GESTURES) {
  simulation.reset();
  simulation.stimulate(STIMULI[gesture]);
  for (let i = 0; i < 175; i++) {
    simulation.step();
    const raw = simulation.rawScores();
    for (const channel of CHANNELS) peaks[channel] = Math.max(peaks[channel], raw[channel]);
  }
}
const available = Object.fromEntries(CHANNELS.map(channel => [channel, peaks[channel] > 1e-6])) as Record<typeof CHANNELS[number], boolean>;
if (!available.escape) throw new Error('No measurable real escape response. Refusing to publish a simulated fallback.');
graph.manifest.calibration = { version: 1, model: MODEL_VERSION, sequence: [...GESTURES], peaks, available };
writeFileSync('public/data/manifest.json', JSON.stringify(graph.manifest, null, 2) + '\n');
console.log('Measured calibration peaks:', peaks);
for (const gesture of GESTURES) {
  simulation.reset(); simulation.stimulate(STIMULI[gesture]);
  const states = new Set<string>();
  for (let i = 0; i < 175; i++) { simulation.step(); states.add(simulation.decoder.state.state); }
  console.log(`${gesture}: ${[...states].join(' → ')}`);
}
