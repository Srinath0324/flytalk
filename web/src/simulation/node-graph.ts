// Node-only utilities for calibration and tests; never imported by browser code.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Graph, Manifest } from './types';
import { validateGraph } from './graph';

export function readGraph(directory = resolve('public/data'), calibrated = true): Graph {
  const manifest: Manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  const file = (name: string) => {
    const bytes = readFileSync(resolve(directory, name));
    if (bytes.length !== manifest.files[name]?.bytes || createHash('sha256').update(bytes).digest('hex') !== manifest.files[name].sha256) throw new Error(`Integrity check failed for ${name}`);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  };
  const graph: Graph = { manifest, neurons: JSON.parse(new TextDecoder().decode(file('neurons.json'))), sources: new Uint32Array(file('sources.u32')), targets: new Uint32Array(file('targets.u32')), counts: new Uint32Array(file('counts.u32')), weights: new Float32Array(file('weights.f32')) };
  validateGraph(graph, calibrated);
  return graph;
}
