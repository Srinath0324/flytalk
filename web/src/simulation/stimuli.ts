import type { Gesture, Stimulus } from './types';

// All amplitudes and time courses are explicit engineering choices.
export const STIMULI: Record<Gesture, Stimulus> = {
  WAVE: { label: 'MOVING OBJECT', populations: { LC10a_L: 0.4, LC10a_R: 0.4 }, duration: 1400, alternate: true },
  POINT_LEFT: { label: 'LEFT OBJECT CUE', populations: { LC10a_L: 0.75 }, duration: 1400 },
  POINT_RIGHT: { label: 'RIGHT OBJECT CUE', populations: { LC10a_R: 0.75 }, duration: 1400 },
  COME: { label: 'BILATERAL OBJECT CUE', populations: { LC10a: 0.65 }, duration: 1400 },
  STOP: { label: 'STIMULUS WITHDRAWN', populations: {}, duration: 0 },
  GO_AWAY: { label: 'MODERATE LOOMING', populations: { LC16: 0.55, LC4: 0.5, LPLC2: 0.5 }, duration: 1000 },
  MIDDLE_FINGER: { label: 'STRONG LOOMING', populations: { LC4: 1, LPLC2: 1 }, duration: 1000 },
  THUMBS_UP: { label: 'GENTLE OBJECT CUE', populations: { LC10a: 0.3 }, duration: 1400 },
};

export const GESTURE_LABELS: Record<Gesture, { label: string; emoji: string; hint: string; key: string }> = {
  WAVE: { label: 'Wave', emoji: '👋', hint: 'Open hand. Wave side to side.', key: '1' },
  POINT_LEFT: { label: 'Left', emoji: '👈', hint: 'Point left in the mirrored preview.', key: '2' },
  POINT_RIGHT: { label: 'Right', emoji: '👉', hint: 'Point right in the mirrored preview.', key: '3' },
  COME: { label: 'Come here', emoji: '☝️', hint: 'Hold one index finger pointing up.', key: '4' },
  STOP: { label: 'Stop', emoji: '✋', hint: 'Hold an open palm still. This removes the stimulus.', key: '5' },
  GO_AWAY: { label: 'Go away', emoji: '🫸', hint: 'Push an open palm toward the camera.', key: '6' },
  MIDDLE_FINGER: { label: 'Insult', emoji: '🖕', hint: 'Middle finger up. Other fingers curled.', key: '7' },
  THUMBS_UP: { label: 'Be nice', emoji: '👍', hint: 'Thumb up. Other fingers curled.', key: '8' },
};
