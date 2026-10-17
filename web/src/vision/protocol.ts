import type { HandObservation } from './gestures';

export type VisionRequest =
  | { type: 'init'; origin: string }
  | { type: 'frame'; bitmap: ImageBitmap; time: number; epoch: number }
  | { type: 'close' };
export type VisionResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | {
      type: 'result';
      hands: HandObservation[];
      time: number;
      epoch: number;
      aspect: number;
      inferenceMs: number;
    }
  | { type: 'error'; message: string; fatal: boolean }
  | { type: 'closed' };
