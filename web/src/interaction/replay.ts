import type { InteractionEvent } from './types';

export const DEMO_DURATION_MS = 35_000;
export const DEMO_VERSION = 2;
export const DEMO_SEED = 41;

const lurePath = [
  { time: 5000, x: 0.38, y: 0.42 },
  { time: 7000, x: 0.5, y: 0.3 },
  { time: 9000, x: 0.64, y: 0.32 },
  { time: 11_000, x: 0.73, y: 0.52 },
  { time: 12_600, x: 0.76, y: 0.6 },
];
// A 25 Hz authored hand path uses the same continuous updates as live input.
// The bead never teleports between the story's key positions.
const lureEvents: InteractionEvent[] = Array.from(
  { length: 199 },
  (_, index) => {
    const time = 5040 + index * 40;
    const next = lurePath.findIndex((point) => point.time > time);
    const end = next < 0 ? lurePath.at(-1)! : lurePath[next];
    const start = next < 0 ? end : lurePath[next - 1];
    const t =
      end.time === start.time
        ? 1
        : (time - start.time) / (end.time - start.time);
    const eased = t * t * (3 - 2 * t);
    return {
      id: 'demo-fruit',
      intent: 'OFFER_NECTAR',
      phase: 'update',
      time,
      source: 'demo',
      target: {
        x: start.x + (end.x - start.x) * eased,
        y: start.y + (end.y - start.y) * eased,
      },
      perchId: 'fruit',
    };
  },
);

// Inputs, not baked animation or neural values. Playback goes through dispatch().
export const DEMO_EVENTS: readonly InteractionEvent[] = [
  {
    id: 'demo-hello',
    intent: 'WAVE',
    phase: 'start',
    time: 400,
    source: 'demo',
  },
  {
    id: 'demo-fruit',
    intent: 'OFFER_NECTAR',
    phase: 'start',
    time: 5000,
    source: 'demo',
    target: { x: 0.38, y: 0.42 },
    perchId: 'fruit',
  },
  ...lureEvents,
  {
    id: 'demo-fruit',
    intent: 'OFFER_NECTAR',
    phase: 'commit',
    time: 13_000,
    source: 'demo',
    perchId: 'fruit',
  },
  {
    id: 'demo-come',
    intent: 'COME',
    phase: 'start',
    time: 29_000,
    source: 'demo',
  },
];
