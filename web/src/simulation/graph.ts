import type { Graph, Manifest, Neuron } from './types';
import { MODEL_VERSION } from './engine';

export function validateGraph(graph: Graph, requireCalibration = true) {
  const { manifest, neurons, sources, targets, counts, weights } = graph;
  if (manifest.schemaVersion !== 1 || manifest.dataset !== 'male-cns:v1.0') throw new Error('Unsupported connectome version. Run npm run setup.');
  if (requireCalibration && (!manifest.calibration || !manifest.calibration.available.escape)) throw new Error('Real escape pathway is not calibrated. Run npm run prepare:data.');
  if (requireCalibration && manifest.calibration?.model !== MODEL_VERSION) throw new Error('Connectome calibration does not match this model. Run npm run calibrate.');
  if (neurons.length !== manifest.neuronCount || neurons.length === 0 || new Set(neurons.map(n => n.id)).size !== neurons.length) throw new Error('Neuron metadata is incomplete or duplicated.');
  if (![sources.length, targets.length, counts.length, weights.length].every(n => n === manifest.edgeCount) || !sources.length) throw new Error('Connection arrays are incomplete.');
  const sums = new Float64Array(neurons.length);
  for (let i = 0; i < sources.length; i++) {
    if (sources[i] >= neurons.length || targets[i] >= neurons.length || counts[i] < 5 || !Number.isFinite(weights[i]) || weights[i] <= 0 || weights[i] > 1) throw new Error('Invalid real-graph edge.');
    sums[targets[i]] += weights[i];
  }
  if (sums.some(sum => sum !== 0 && Math.abs(sum - 1) > 1e-5)) throw new Error('Incoming weights are not normalized.');
  for (const population of Object.values(manifest.populations)) if (population.some(i => !Number.isInteger(i) || i < 0 || i >= neurons.length)) throw new Error('Population contains an invalid neuron index.');
}

export async function loadGraph(): Promise<Graph> {
  const response = await fetch('/data/manifest.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('The real connectome is not prepared yet. Run npm run setup in the web folder, then retry.');
  const manifest: Manifest = await response.json();
  const files = await Promise.all(['neurons.json', 'sources.u32', 'targets.u32', 'counts.u32', 'weights.f32'].map(async name => {
    const result = await fetch(`/data/${name}`);
    if (!result.ok) throw new Error(`Missing graph file: ${name}. Run npm run prepare:data.`);
    const bytes = await result.arrayBuffer();
    const record = manifest.files[name];
    if (!record || bytes.byteLength !== record.bytes) throw new Error(`Incomplete graph file: ${name}.`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== record.sha256) throw new Error(`Graph integrity check failed: ${name}. Rerun setup.`);
    return bytes;
  }));
  const graph: Graph = { manifest, neurons: JSON.parse(new TextDecoder().decode(files[0])) as Neuron[], sources: new Uint32Array(files[1]), targets: new Uint32Array(files[2]), counts: new Uint32Array(files[3]), weights: new Float32Array(files[4]) };
  validateGraph(graph);
  return graph;
}
