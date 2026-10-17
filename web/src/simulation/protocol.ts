import type { GestureEvent, Manifest, SimulationSnapshot } from './types';

export interface PlaybackState {
  active: boolean;
  generation: number;
  timeMs: number;
}

export type SimulationRequest =
  | {
      type: 'init';
      paused: boolean;
      detailed: boolean;
      playback: PlaybackState;
    }
  | { type: 'gesture'; event: GestureEvent }
  | { type: 'reset' }
  | { type: 'playback'; active: boolean; generation: number }
  | { type: 'advance-playback'; timeMs: number; generation: number }
  | { type: 'visibility'; paused: boolean }
  | { type: 'detail'; enabled: boolean };
export type SimulationResponse =
  | {
      type: 'ready';
      manifest: Manifest;
      snapshot: SimulationSnapshot;
      playbackGeneration: number;
    }
  | {
      type: 'snapshot';
      snapshot: SimulationSnapshot;
      playbackGeneration: number;
    }
  | { type: 'error'; message: string };
