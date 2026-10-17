import { Simulation, MODEL_VERSION } from '../src/simulation/engine';
import { readGraph } from '../src/simulation/node-graph';
import { STIMULI } from '../src/simulation/stimuli';
import { CHANNELS, GESTURES, emptyScores } from '../src/simulation/types';

const graph = readGraph();
console.log(
  JSON.stringify(
    {
      dataset: graph.manifest.dataset,
      model: MODEL_VERSION,
      neurons: graph.manifest.neuronCount,
      connections: graph.manifest.edgeCount,
      representedSynapses: graph.manifest.synapseCount,
      calibration: graph.manifest.calibration,
    },
    null,
    2,
  ),
);
for (const gesture of GESTURES) {
  const simulation = new Simulation(graph);
  const rawPeaks = emptyScores(),
    normalizedPeaks = emptyScores();
  const transitions: { time: number; state: string }[] = [];
  const dwell: Record<string, number> = {};
  simulation.stimulate(STIMULI[gesture]);
  let previous = '';
  for (let i = 0; i < 250; i++) {
    simulation.step();
    const state = simulation.decoder.state.state;
    if (state !== previous) {
      transitions.push({ time: simulation.time, state });
      previous = state;
    }
    dwell[state] = (dwell[state] ?? 0) + 20;
    const raw = simulation.rawScores(),
      scores = simulation.scores(raw);
    for (const channel of CHANNELS) {
      rawPeaks[channel] = Math.max(rawPeaks[channel], raw[channel]);
      normalizedPeaks[channel] = Math.max(
        normalizedPeaks[channel],
        scores[channel],
      );
    }
  }
  console.log(
    JSON.stringify({
      gesture,
      rawPeaks,
      normalizedPeaks,
      transitions,
      dwellMs: dwell,
    }),
  );
}
console.log(
  'Read-only report. Normalized values are relative activity, not confidence. No data files changed.',
);
