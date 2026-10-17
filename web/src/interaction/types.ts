import type { Gesture } from '../simulation/types';

export type Intent = Gesture | 'OFFER_NECTAR' | 'VICTORY';
export type InputSource = 'camera' | 'keyboard' | 'pointer' | 'demo';
export type InputPhase = 'start' | 'update' | 'commit' | 'cancel';
export interface Point2 {
  x: number;
  y: number;
}
export type Vec3 = [number, number, number];
export interface InteractionEvent {
  id: string;
  intent: Intent;
  phase: InputPhase;
  time: number;
  source: InputSource;
  target?: Point2;
  perchId?: string;
}
export type Mood = 'curious' | 'comfortable' | 'startled';
export type ActionPhase =
  | 'resting'
  | 'anticipation'
  | 'flying'
  | 'offering'
  | 'landing'
  | 'feeding'
  | 'grooming'
  | 'hovering';
export interface ActorPose {
  position: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  flight: number;
  feed: number;
  groom: number;
  attention: Vec3;
}
export interface NectarState {
  position: Vec3;
  perchId: string;
  committed: boolean;
  amount: number;
}
export interface DirectorSnapshot {
  revision: number;
  actionId: string;
  intent: Intent | null;
  phase: ActionPhase;
  mood: Mood;
  pose: ActorPose;
  nectar: NectarState | null;
  bubble: { id: number; text: string; until: number } | null;
  time: number;
  progress: number;
  demo: boolean;
}
export const CONTROLS: {
  intent: Intent;
  key: string;
  label: string;
  hint: string;
}[] = [
  {
    intent: 'WAVE',
    key: '1',
    label: 'Hello',
    hint: 'Wave your open hand side to side',
  },
  { intent: 'POINT_LEFT', key: '2', label: 'Left', hint: 'Point to your left' },
  {
    intent: 'POINT_RIGHT',
    key: '3',
    label: 'Right',
    hint: 'Point to your right',
  },
  {
    intent: 'COME',
    key: '4',
    label: 'Come closer',
    hint: 'Hold your index finger upright',
  },
  { intent: 'STOP', key: '5', label: 'Stay', hint: 'Hold a still open palm' },
  {
    intent: 'GO_AWAY',
    key: '6',
    label: 'Shoo',
    hint: 'Push an open palm toward the camera',
  },
  {
    intent: 'MIDDLE_FINGER',
    key: '7',
    label: 'Trash',
    hint: 'One very impolite finger',
  },
  {
    intent: 'THUMBS_UP',
    key: '8',
    label: 'Good fly',
    hint: 'Give a thumbs up',
  },
  {
    intent: 'OFFER_NECTAR',
    key: '9',
    label: 'Offer nectar',
    hint: 'Pinch, move, then open your fingers to feed',
  },
  {
    intent: 'VICTORY',
    key: '0',
    label: 'Show off',
    hint: 'Hold a victory sign',
  },
];
