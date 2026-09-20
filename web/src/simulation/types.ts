export const GESTURES = ['WAVE', 'POINT_LEFT', 'POINT_RIGHT', 'COME', 'STOP', 'GO_AWAY', 'MIDDLE_FINGER', 'THUMBS_UP'] as const;
export type Gesture = typeof GESTURES[number];
export type Behavior = 'IDLE' | 'MOVE_LEFT' | 'MOVE_RIGHT' | 'APPROACH' | 'STOP' | 'RETREAT' | 'ESCAPE' | 'CONFUSED';
export const CHANNELS = ['escape', 'retreat', 'left', 'right', 'approach'] as const;
export type Channel = typeof CHANNELS[number];
export type Scores = Record<Channel, number>;
export interface GestureEvent { gesture: Gesture; timestamp: number; source: 'camera' | 'button' | 'agent' }
export interface Stimulus { label: string; populations: Record<string, number>; duration: number; alternate?: boolean }
export interface BehaviorResult { state: Behavior; strength: number }
export interface Neuron { id: string; type: string; instance: string | null; side: string | null; role: 'input' | 'intermediate' | 'output'; neurotransmitter: string | null }
export interface Manifest {
  schemaVersion: number; dataset: string; license: string; sourcePage: string; generatedAt: string;
  neuronCount: number; edgeCount: number; synapseCount: number; tracedSourceNeurons: number;
  populations: Record<string, number[]>;
  files: Record<string, { bytes: number; sha256: string }>;
  reachability: Record<string, Record<string, number>>;
  calibration: { version: number; peaks: Scores; available: Record<Channel, boolean>; sequence: string[]; model: string } | null;
  preparationSeconds: number;
  assumptions: string[];
}
export interface Graph { manifest: Manifest; neurons: Neuron[]; sources: Uint32Array; targets: Uint32Array; counts: Uint32Array; weights: Float32Array }
export interface SimulationSnapshot {
  activity: Float32Array; scores: Scores; rawScores: Scores; activeNeurons: number;
  behavior: BehaviorResult; stimulus: string; stimulusActive: boolean; time: number; stepMs: number;
}
export const emptyScores = (): Scores => ({ escape: 0, retreat: 0, left: 0, right: 0, approach: 0 });
