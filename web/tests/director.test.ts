import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionDirector } from '../src/interaction/director';
import { DEMO_DURATION_MS, DEMO_EVENTS } from '../src/interaction/replay';
import {
  nectarPosition,
  PERCHES,
  restingPosition,
  targetToWorld,
} from '../src/interaction/world';
import { GESTURES } from '../src/simulation/types';
import type { InteractionEvent, Intent } from '../src/interaction/types';

const event = (
  intent: Intent,
  id: string = intent,
  extra: Partial<InteractionEvent> = {},
): InteractionEvent => ({
  id,
  intent,
  phase: 'start',
  time: 0,
  source: 'keyboard',
  ...extra,
});
const advance = (director: ActionDirector, seconds: number, rate = 60) => {
  const frames = Math.round(seconds * rate);
  for (let i = 0; i < frames; i++) director.update(seconds / frames);
};
const offer = (director: ActionDirector, id = 'food', perchId = 'fruit') => {
  assert.equal(director.dispatch(event('OFFER_NECTAR', id, { perchId })), true);
  assert.equal(
    director.dispatch(event('OFFER_NECTAR', id, { phase: 'commit', perchId })),
    true,
  );
};

void test('all legacy commands acknowledge reliably and emit only their existing neural cue', () => {
  for (const gesture of GESTURES) {
    const director = new ActionDirector();
    assert.equal(director.dispatch(event(gesture)), true);
    assert.ok(director.snapshot.bubble?.text);
    assert.deepEqual(director.drainNeuralEvents(), [gesture]);
    advance(director, 4);
    assert.equal(director.snapshot.intent, gesture);
    assert.ok(director.snapshot.pose.position.every(Number.isFinite));
    if (gesture === 'POINT_LEFT')
      assert.ok(director.snapshot.pose.position[0] < -2);
    if (gesture === 'POINT_RIGHT')
      assert.ok(director.snapshot.pose.position[0] > 2);
    if (gesture === 'COME') assert.ok(director.snapshot.pose.position[2] > 2);
    if (gesture === 'GO_AWAY')
      assert.ok(director.snapshot.pose.position[2] < -1.5);
  }
});

void test('one accepted action per ID, but repeating a gesture with a new ID acknowledges again', () => {
  const director = new ActionDirector();
  director.dispatch(event('WAVE', 'first'));
  const bubble = director.snapshot.bubble!.id;
  assert.equal(director.dispatch(event('WAVE', 'first')), false);
  assert.equal(director.dispatch(event('WAVE', 'second')), true);
  assert.ok(director.snapshot.bubble!.id > bubble);
  assert.deepEqual(director.drainNeuralEvents(), ['WAVE', 'WAVE']);
});

void test('all three perches support exact landing, feeding, grooming and stable contact', () => {
  for (const perch of PERCHES) {
    const director = new ActionDirector();
    offer(director, 'food', perch.id);
    advance(director, 3);
    assert.equal(director.snapshot.phase, 'feeding');
    assert.deepEqual(
      director.snapshot.pose.position,
      restingPosition(perch.id),
    );
    assert.equal(director.snapshot.pose.flight, 0);
    advance(director, 2);
    assert.ok(director.snapshot.pose.feed > 0.9);
    assert.ok(director.snapshot.nectar!.amount < 0.55);
    advance(director, 2);
    assert.equal(director.snapshot.phase, 'grooming');
    advance(director, 1);
    assert.ok(director.snapshot.pose.groom > 0.9);
    advance(director, 1);
    assert.equal(director.snapshot.phase, 'resting');
    assert.equal(director.snapshot.nectar, null);
    assert.equal(director.snapshot.mood, 'comfortable');
    assert.deepEqual(director.drainNeuralEvents(), []);
  }
});

void test('feeding interruption retracts before takeoff; Stop keeps contact', () => {
  const director = new ActionDirector();
  offer(director);
  advance(director, 4);
  const contact = [...director.snapshot.pose.position];
  director.dispatch(event('COME'));
  director.update(0.2);
  assert.equal(director.snapshot.phase, 'anticipation');
  assert.deepEqual(director.snapshot.pose.position, contact);
  assert.ok(director.snapshot.pose.feed < 1);
  director.update(0.5);
  assert.equal(director.snapshot.phase, 'flying');
  assert.equal(director.snapshot.pose.feed, 0);
  assert.notDeepEqual(director.snapshot.pose.position, contact);

  director.reset();
  offer(director);
  advance(director, 4);
  director.dispatch(event('STOP'));
  advance(director, 1);
  assert.equal(director.snapshot.phase, 'resting');
  assert.deepEqual(director.snapshot.pose.position, restingPosition('fruit'));
  assert.equal(director.snapshot.pose.feed, 0);
});

void test('Stop recovers a safe hover during landing, and only keeps feet planted after touchdown', () => {
  for (const perch of PERCHES) {
    for (const elapsed of [0.7, 2.5, 2.9, 2.98]) {
      const director = new ActionDirector();
      offer(director, 'food', perch.id);
      advance(director, elapsed);
      const before = [...director.snapshot.pose.position];
      assert.equal(director.snapshot.phase, 'landing');
      director.dispatch(event('STOP'));
      assert.deepEqual(
        director.snapshot.pose.position,
        before,
        'acceptance must not teleport the fly',
      );
      advance(director, 0.5);
      assert.equal(director.snapshot.phase, 'hovering');
      assert.equal(director.snapshot.pose.flight, 1);
      assert.ok(director.snapshot.pose.position[1] >= 1.65);
      assert.equal(director.snapshot.nectar, null);
      advance(director, 4);
      assert.equal(
        director.snapshot.phase,
        'hovering',
        'cancelled landing must never continue into feeding',
      );
    }
    const director = new ActionDirector();
    offer(director, 'food', perch.id);
    advance(director, 3);
    director.dispatch(event('STOP'));
    advance(director, 1);
    assert.equal(director.snapshot.phase, 'resting');
    assert.equal(director.snapshot.pose.flight, 0);
    assert.deepEqual(
      director.snapshot.pose.position,
      restingPosition(perch.id),
    );
  }
});

void test('repeat left and right at their destination produce another visible bank without drifting offstage', () => {
  for (const intent of ['POINT_LEFT', 'POINT_RIGHT'] as const) {
    const director = new ActionDirector();
    director.dispatch(event(intent, 'first'));
    advance(director, 4);
    const edge = director.snapshot.pose.position[0];
    director.dispatch(event(intent, 'repeat'));
    let lateralMotion = 0,
      maxBank = 0;
    for (let frame = 0; frame < 240; frame++) {
      director.update(1 / 60);
      lateralMotion = Math.max(
        lateralMotion,
        Math.abs(director.snapshot.pose.position[0] - edge),
      );
      maxBank = Math.max(maxBank, Math.abs(director.snapshot.pose.roll));
    }
    assert.ok(lateralMotion > 0.25);
    assert.ok(maxBank > 0.3);
    assert.equal(director.snapshot.pose.position[0], edge);
  }
});

void test('shoo ends on the distant stone without entering a feeding animation', () => {
  const director = new ActionDirector();
  director.dispatch(event('GO_AWAY'));
  const phases = new Set<string>();
  for (let frame = 0; frame < 240; frame++) {
    director.update(1 / 60);
    phases.add(director.snapshot.phase);
  }
  assert.equal(director.snapshot.phase, 'resting');
  assert.deepEqual(director.snapshot.pose.position, restingPosition('stone'));
  assert.equal(director.snapshot.pose.flight, 0);
  assert.equal(phases.has('feeding'), false);
});

void test('lure cancellation, stale updates and invalid commits cannot place nectar', () => {
  const director = new ActionDirector();
  director.dispatch(event('OFFER_NECTAR', 'a', { target: { x: 1, y: 0.5 } }));
  assert.equal(director.snapshot.nectar?.perchId, 'fruit');
  assert.equal(
    director.dispatch(
      event('OFFER_NECTAR', 'a', { phase: 'commit', perchId: 'unknown' }),
    ),
    false,
  );
  assert.equal(director.snapshot.nectar?.committed, false);
  assert.equal(
    director.dispatch(event('OFFER_NECTAR', 'a', { phase: 'cancel' })),
    true,
  );
  assert.equal(director.snapshot.nectar, null);
  assert.equal(
    director.dispatch(event('OFFER_NECTAR', 'a', { phase: 'commit' })),
    false,
  );
  director.dispatch(event('OFFER_NECTAR', 'b', { perchId: 'stone' }));
  director.dispatch(event('WAVE', 'hello'));
  assert.equal(
    director.dispatch(event('OFFER_NECTAR', 'b', { phase: 'update' })),
    false,
  );
  assert.equal(director.snapshot.intent, 'WAVE');
});

void test('continuous lure updates do not permanently restart ground anticipation', () => {
  const director = new ActionDirector();
  director.dispatch(event('OFFER_NECTAR', 'lure', { perchId: 'fruit' }));
  for (let i = 0; i < 30; i++) {
    director.dispatch(
      event('OFFER_NECTAR', 'lure', {
        phase: 'update',
        target: { x: 0.8, y: 0.4 },
      }),
    );
    director.update(1 / 30);
  }
  assert.ok(director.snapshot.pose.flight > 0.9);
  assert.ok(director.snapshot.pose.position[1] > 1.5);
  assert.equal(
    director.dispatch(event('OFFER_NECTAR', 'lure', { phase: 'commit' })),
    true,
  );
  assert.equal(director.snapshot.nectar?.committed, true);
});

void test('continuous lure updates converge on their target without accumulating flight arcs', () => {
  const director = new ActionDirector();
  const target = { x: 0.8, y: 0.4 };
  director.dispatch(event('OFFER_NECTAR', 'lure', { target }));
  for (let frame = 0; frame < 90; frame++) {
    director.dispatch(
      event('OFFER_NECTAR', 'lure', { phase: 'update', target }),
    );
    director.update(1 / 30);
  }
  const destination = targetToWorld(target);
  assert.ok(
    Math.abs(director.snapshot.pose.position[0] - destination[0] * 0.75) < 0.01,
  );
  assert.ok(
    Math.abs(director.snapshot.pose.position[1] - (destination[1] + 0.65)) <
      0.01,
  );
  assert.ok(
    Math.abs(director.snapshot.pose.position[2] - destination[2]) < 0.01,
  );
});

void test('lure moves freely and committed nectar eases onto its preview perch', () => {
  const director = new ActionDirector();
  director.dispatch(
    event('OFFER_NECTAR', 'lure', { target: { x: 0.8, y: 0.2 } }),
  );
  assert.equal(director.snapshot.phase, 'offering');
  const initial = [...director.snapshot.nectar!.position];
  director.dispatch(
    event('OFFER_NECTAR', 'lure', {
      phase: 'update',
      target: { x: 0.7, y: 0.4 },
    }),
  );
  assert.notDeepEqual(director.snapshot.nectar!.position, initial);
  assert.deepEqual(
    director.snapshot.nectar!.position,
    targetToWorld({ x: 0.7, y: 0.4 }),
  );
  const beforeCommit = [...director.snapshot.nectar!.position];
  director.dispatch(event('OFFER_NECTAR', 'lure', { phase: 'commit' }));
  assert.deepEqual(director.snapshot.nectar!.position, beforeCommit);
  const destination = nectarPosition(director.snapshot.nectar!.perchId);
  director.update(0.2);
  assert.notDeepEqual(director.snapshot.nectar!.position, beforeCommit);
  assert.notDeepEqual(director.snapshot.nectar!.position, destination);
  director.update(0.3);
  assert.deepEqual(director.snapshot.nectar!.position, destination);
});

void test('spectacle has no invented neural pulse and remains bounded; reduced motion removes roll', () => {
  const director = new ActionDirector();
  director.dispatch(event('VICTORY'));
  let maxRoll = 0;
  for (let i = 0; i < 240; i++) {
    director.update(1 / 60);
    maxRoll = Math.max(maxRoll, Math.abs(director.snapshot.pose.roll));
    const [x, y, z] = director.snapshot.pose.position;
    assert.ok(
      Math.abs(x) <= 3 && y >= 0.55 && y <= 3.7 && z >= -2.2 && z <= 2.6,
    );
  }
  assert.ok(maxRoll > Math.PI);
  assert.deepEqual(director.drainNeuralEvents(), []);
  director.reset();
  director.setReducedMotion(true);
  director.dispatch(event('VICTORY'));
  for (let i = 0; i < 240; i++) {
    director.update(1 / 60);
    assert.equal(director.snapshot.pose.roll, 0);
  }
});

void test('rapid interrupted actions, extreme lure targets and idle bob stay inside the habitat', () => {
  const director = new ActionDirector();
  const check = () => {
    const {
      position: [x, y, z],
      yaw,
      pitch,
      roll,
    } = director.snapshot.pose;
    assert.ok([x, y, z, yaw, pitch, roll].every(Number.isFinite));
    assert.ok(
      x >= -3 && x <= 3 && y >= 0.55 && y <= 3.65 && z >= -2.2 && z <= 2.6,
    );
  };
  let serial = 0;
  for (const target of [
    { x: -100, y: -100 },
    { x: 100, y: 100 },
  ]) {
    director.dispatch(event('OFFER_NECTAR', `extreme-${serial++}`, { target }));
    for (let i = 0; i < 80; i++) {
      director.update(1 / 60);
      check();
    }
  }
  for (let cycle = 0; cycle < 6; cycle++) {
    for (const intent of [...GESTURES, 'VICTORY'] as Intent[]) {
      director.dispatch(event(intent, `command-${serial++}`));
      for (let i = 0; i < 43; i++) {
        director.update(1 / 60);
        check();
      }
    }
  }
  director.dispatch(event('STOP', 'last-stop'));
  for (let i = 0; i < 300; i++) {
    director.update(1 / 60);
    check();
  }
});

void test('35-second replay reproduces outcomes across render rates and live input takes over', () => {
  const a = new ActionDirector(),
    b = new ActionDirector();
  a.startDemo();
  b.startDemo();
  advance(a, DEMO_DURATION_MS / 1000, 30);
  advance(b, DEMO_DURATION_MS / 1000, 60);
  assert.equal(a.snapshot.demo, false);
  assert.equal(b.snapshot.demo, false);
  assert.equal(a.snapshot.phase, 'hovering');
  assert.equal(a.snapshot.mood, 'comfortable');
  assert.equal(a.snapshot.intent, 'COME');
  for (let axis = 0; axis < 3; axis++)
    assert.ok(
      Math.abs(
        a.snapshot.pose.position[axis] - b.snapshot.pose.position[axis],
      ) < 1e-9,
    );
  assert.equal(a.snapshot.phase, b.snapshot.phase);
  assert.deepEqual(a.drainNeuralEvents(), b.drainNeuralEvents());
  a.startDemo();
  a.update(1);
  a.dispatch(event('STOP', 'takeover'));
  assert.equal(a.snapshot.demo, false);
  advance(a, 10);
  assert.equal(a.snapshot.intent, 'STOP');
});

void test('showcase tells one companion story with a smooth lure, full meal and close farewell', () => {
  const director = new ActionDirector();
  director.startDemo();
  director.update(5);
  assert.equal(director.snapshot.phase, 'offering');
  assert.equal(director.snapshot.nectar?.committed, false);
  const updateEvents = DEMO_EVENTS.filter((e) => e.phase === 'update');
  for (let index = 1; index < updateEvents.length; index++) {
    const a = updateEvents[index - 1].target!,
      b = updateEvents[index].target!;
    assert.ok(
      Math.hypot(a.x - b.x, a.y - b.y) < 0.02,
      'lure path must not jump',
    );
  }
  director.update(8);
  assert.equal(director.snapshot.phase, 'landing');
  assert.equal(director.snapshot.nectar?.committed, true);
  director.update(3);
  assert.equal(director.snapshot.phase, 'feeding');
  director.update(4);
  assert.equal(director.snapshot.phase, 'grooming');
  director.update(2);
  assert.equal(director.snapshot.phase, 'resting');
  assert.equal(director.snapshot.mood, 'comfortable');
  director.update(7);
  assert.equal(director.snapshot.intent, 'COME');
  director.update(6);
  assert.equal(director.snapshot.demo, false);
  assert.equal(director.snapshot.phase, 'hovering');
  assert.ok(director.snapshot.pose.position[2] > 2);
  assert.equal(DEMO_EVENTS.filter((e) => e.phase === 'commit').length, 1);
  assert.equal(
    DEMO_EVENTS.some((e) => e.intent === 'VICTORY'),
    false,
  );
  assert.deepEqual(director.drainNeuralEvents(), ['WAVE', 'COME']);
});

void test('Stop interrupts every active phase and reset permits clean replay of the same IDs', () => {
  const cases: Array<(director: ActionDirector) => void> = [
    (director) => {
      director.dispatch(event('WAVE'));
      advance(director, 0.05);
    },
    (director) => {
      director.dispatch(event('WAVE'));
      advance(director, 1);
    },
    (director) => {
      director.dispatch(event('VICTORY'));
      advance(director, 1.8);
    },
    (director) => {
      offer(director);
      advance(director, 1);
    },
    (director) => {
      offer(director);
      advance(director, 4);
    },
    (director) => {
      offer(director);
      advance(director, 8);
    },
  ];
  for (const setup of cases) {
    const director = new ActionDirector();
    setup(director);
    director.dispatch(event('STOP'));
    advance(director, 1);
    assert.equal(director.snapshot.intent, 'STOP');
    assert.ok(['resting', 'hovering'].includes(director.snapshot.phase));
    assert.equal(director.snapshot.pose.feed, 0);
    assert.equal(director.snapshot.pose.groom, 0);
    assert.equal(director.snapshot.pose.roll, 0);
    assert.equal(director.snapshot.pose.pitch, 0);
    director.reset();
    assert.equal(director.dispatch(event('STOP')), true);
  }
});

void test('reset preserves snapshot reference while clearing every interaction state', () => {
  const director = new ActionDirector();
  const snapshot = director.snapshot;
  director.startDemo();
  advance(director, 10);
  director.reset();
  assert.equal(director.snapshot, snapshot);
  assert.equal(snapshot.time, 0);
  assert.equal(snapshot.demo, false);
  assert.equal(snapshot.nectar, null);
  assert.equal(snapshot.bubble, null);
  assert.equal(snapshot.intent, null);
  assert.deepEqual(snapshot.pose.position, restingPosition('leaf'));
  assert.deepEqual(director.drainNeuralEvents(), []);
});
