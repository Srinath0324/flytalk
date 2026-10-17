import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractHandFeatures,
  GestureController,
  type HandObservation,
} from '../src/vision/gestures';
import type { InteractionEvent } from '../src/interaction/types';
import { ActionDirector } from '../src/interaction/director';

import { hand } from './fixtures/hand';

function hold(
  controller: GestureController,
  observation: HandObservation | null,
  from: number,
  duration: number,
  step = 40,
): InteractionEvent[] {
  const events: InteractionEvent[] = [];
  for (let time = from; time <= from + duration; time += step)
    events.push(
      ...controller.update(observation ? [observation] : [], time).events,
    );
  return events;
}
const commits = (events: InteractionEvent[]) =>
  events.filter((event) =>
    event.intent === 'OFFER_NECTAR'
      ? event.phase === 'commit'
      : event.phase === 'start',
  );

void test('every static command can replace the previous pose without a neutral interlude', () => {
  const controller = new GestureController();
  const poses = [
    hand('thumb'),
    hand('victory'),
    hand('index'),
    hand('index', { roll: Math.PI / 2 }),
    hand('index', { roll: -Math.PI / 2 }),
    hand('middle'),
    hand('palm'),
  ];
  const events = poses.flatMap((pose, i) =>
    hold(controller, pose, i * 1000, 960),
  );
  assert.deepEqual(
    commits(events).map((e) => e.intent),
    [
      'THUMBS_UP',
      'VICTORY',
      'COME',
      'POINT_LEFT',
      'POINT_RIGHT',
      'MIDDLE_FINGER',
      'STOP',
    ],
  );
});

void test('a stopped open palm can subsequently wave or push without first making a fist', () => {
  for (const movement of ['wave', 'push']) {
    const controller = new GestureController();
    hold(controller, hand('palm'), 0, 1000);
    const events: InteractionEvent[] = [];
    for (let i = 0; i < 24; i++) {
      const scale = movement === 'push' ? 1 + Math.max(0, i - 4) * 0.045 : 1;
      events.push(
        ...controller.update(
          [
            hand('palm', {
              scale,
              y: 0.65 + (scale - 1) * 0.15 * 0.56,
              x:
                movement === 'wave'
                  ? 0.5 + Math.sin((i / 20) * Math.PI * 3) * 0.105
                  : 0.5,
            }),
          ],
          1040 + i * 40,
        ).events,
      );
    }
    assert.ok(
      commits(events).some(
        (e) => e.intent === (movement === 'wave' ? 'WAVE' : 'GO_AWAY'),
      ),
      movement,
    );
    assert.ok(!commits(events).some((e) => e.intent === 'STOP'));
  }
});

void test('a one-frame pose error does not repeat an accepted command or defeat stable dwell', () => {
  const controller = new GestureController();
  hold(controller, hand('thumb'), 0, 800);
  controller.update([hand('victory')], 840);
  assert.equal(commits(hold(controller, hand('thumb'), 880, 800)).length, 0);
  const fresh = new GestureController();
  hold(fresh, hand('neutral'), 0, 400);
  fresh.update([hand('thumb')], 440);
  fresh.update([hand('thumb')], 520);
  fresh.update([hand('neutral')], 560);
  const events = hold(fresh, hand('thumb'), 600, 400);
  assert.deepEqual(
    commits(events).map((e) => e.intent),
    ['THUMBS_UP'],
  );
});

void test('normal commands tolerate 5 Hz inference while nectar still cancels on a 200 ms gap', () => {
  const controller = new GestureController();
  assert.deepEqual(
    commits(hold(controller, hand('thumb'), 0, 1200, 200)).map((e) => e.intent),
    ['THUMBS_UP'],
  );
});

void test('finger geometry survives handedness, distance and wrist roll; screen directions mirror once', () => {
  for (const handedness of ['Left', 'Right'] as const)
    for (const scale of [0.6, 1, 1.6])
      for (const roll of [-Math.PI / 4, 0, Math.PI / 4]) {
        const open = extractHandFeatures(
          hand('palm', { handedness, scale, roll }),
        );
        assert.equal(open?.pose, 'OPEN_PALM');
        const middle = extractHandFeatures(
          hand('middle', { handedness, scale, roll }),
        );
        assert.equal(middle?.pose, 'MIDDLE_FINGER');
        assert.ok(
          extractHandFeatures(hand('pinch', { handedness, scale, roll }))!
            .pinch < 0.25,
        );
      }
  assert.equal(
    extractHandFeatures(hand('index', { roll: Math.PI / 2 }))?.pose,
    'POINT_LEFT',
  );
  assert.equal(
    extractHandFeatures(hand('index', { roll: -Math.PI / 2 }))?.pose,
    'POINT_RIGHT',
  );
  const leftTarget = extractHandFeatures(hand('pinch', { x: 0.7 }))!.target;
  const rightTarget = extractHandFeatures(hand('pinch', { x: 0.3 }))!.target;
  assert.ok(leftTarget.x < rightTarget.x);
});

void test('a fist is neutral, not accidental nectar; brief poses and low-score thumbs do nothing', () => {
  const controller = new GestureController();
  assert.equal(hold(controller, hand('neutral'), 0, 1000).length, 0);
  assert.equal(
    hold(controller, hand('thumb', { categoryScore: 0.6 }), 1040, 400).length,
    0,
  );
  assert.equal(hold(controller, hand('thumb'), 1480, 160).length, 0);
  assert.equal(hold(controller, hand('neutral'), 1680, 300).length, 0);
});

void test('a held static gesture commits once; different poses work directly and neutral rearms repeats', () => {
  const controller = new GestureController();
  assert.deepEqual(
    commits(hold(controller, hand('thumb'), 0, 10000)).map((e) => e.intent),
    ['THUMBS_UP'],
  );
  assert.deepEqual(
    commits(hold(controller, hand('victory'), 10040, 1000)).map(
      (e) => e.intent,
    ),
    ['VICTORY'],
  );
  hold(controller, hand('neutral'), 11080, 300);
  assert.deepEqual(
    commits(hold(controller, hand('victory'), 11420, 500)).map((e) => e.intent),
    ['VICTORY'],
  );
});

void test('a stationary open palm stops once without waving or pushing at different distances', () => {
  for (const scale of [0.6, 1, 1.6]) {
    const controller = new GestureController();
    assert.deepEqual(
      commits(hold(controller, hand('palm', { scale }), 0, 3000)).map(
        (e) => e.intent,
      ),
      ['STOP'],
    );
  }
});

void test('two large direction reversals wave once; finishing the wave never emits STOP', () => {
  const controller = new GestureController();
  hold(controller, hand('neutral'), 0, 400);
  const events: InteractionEvent[] = [];
  for (let frame = 0; frame < 21; frame++) {
    const x = 0.5 + Math.sin((frame / 20) * Math.PI * 3) * 0.105;
    events.push(
      ...controller.update([hand('palm', { x })], 440 + frame * 40).events,
    );
  }
  events.push(...hold(controller, hand('palm'), 1280, 2000));
  assert.deepEqual(
    commits(events).map((e) => e.intent),
    ['WAVE'],
  );
});

void test('push uses a stable baseline and scale growth; relative finger depth alone is not a push', () => {
  const controller = new GestureController();
  hold(controller, hand('neutral'), 0, 400);
  const events: InteractionEvent[] = [];
  for (let frame = 0; frame < 15; frame++) {
    const scale = frame < 5 ? 1 : 1 + (frame - 4) * 0.045;
    // Scale around the palm center, not the wrist, to model a forward push.
    const y = 0.65 + (scale - 1) * 0.15 * 0.56;
    events.push(
      ...controller.update([hand('palm', { scale, y })], 440 + frame * 40)
        .events,
    );
  }
  assert.ok(commits(events).some((e) => e.intent === 'GO_AWAY'));
  assert.ok(!commits(events).some((e) => e.intent === 'WAVE'));
  const another = new GestureController();
  const tilted = hand('palm');
  for (const i of [8, 12, 16, 20]) tilted.landmarks[i].z = -0.2;
  assert.ok(
    !commits(hold(another, tilted, 0, 1600)).some(
      (e) => e.intent === 'GO_AWAY',
    ),
  );
});

void test('pinch owns the hand, updates a bounded lure and releases exactly once without STOP or COME', () => {
  const controller = new GestureController();
  const events = hold(controller, hand('pinch'), 0, 800);
  assert.equal(events.filter((e) => e.phase === 'start').length, 1);
  const start = events.find((e) => e.phase === 'start')!;
  events.push(...hold(controller, hand('pinch', { x: 0.4 }), 840, 300));
  events.push(...hold(controller, hand('palm'), 1200, 1500));
  const released = commits(events);
  assert.equal(released.length, 1);
  assert.equal(released[0].intent, 'OFFER_NECTAR');
  assert.equal(released[0].id, start.id);
  assert.ok(released[0].perchId);
  assert.ok(
    events
      .filter((e) => e.target)
      .every(
        (e) =>
          e.target!.x >= 0 &&
          e.target!.x <= 1 &&
          e.target!.y >= 0 &&
          e.target!.y <= 1,
      ),
  );
});

void test('pinch threshold jitter never releases until the open threshold stays crossed for 120ms', () => {
  const controller = new GestureController();
  hold(controller, hand('pinch'), 0, 800);
  const events: InteractionEvent[] = [];
  for (let i = 0; i < 20; i++)
    events.push(
      ...controller.update(
        [hand('pinch', { ratio: i % 2 ? 0.45 : 0.3 })],
        840 + i * 40,
      ).events,
    );
  assert.equal(commits(events).length, 0);
  events.push(...hold(controller, hand('pinch', { ratio: 0.55 }), 1640, 200));
  assert.equal(commits(events).length, 1);
});

void test('losing a pinched hand cancels at 200ms, never feeds; returning pinched cannot restart', () => {
  const controller = new GestureController();
  hold(controller, hand('pinch'), 0, 800);
  assert.equal(controller.update([], 960).events.length, 0);
  const loss = controller.update([], 1000).events;
  assert.deepEqual(
    loss.map((e) => e.phase),
    ['cancel'],
  );
  assert.equal(hold(controller, hand('pinch'), 1040, 1000).length, 0);
  hold(controller, hand('neutral'), 2080, 300);
  assert.equal(
    hold(controller, hand('pinch'), 2420, 400).filter(
      (e) => e.phase === 'start',
    ).length,
    1,
  );
});

void test('another hand cannot inherit an offer; ambiguous overlaps cancel instead of releasing', () => {
  const controller = new GestureController();
  hold(controller, hand('pinch', { x: 0.35 }), 0, 800);
  const events: InteractionEvent[] = [];
  for (let t = 840; t <= 1200; t += 40)
    events.push(
      ...controller.update([hand('palm', { x: 0.75, handedness: 'Left' })], t)
        .events,
    );
  assert.deepEqual(
    events.map((e) => e.phase),
    ['cancel'],
  );
  const ambiguous = new GestureController();
  hold(ambiguous, hand('pinch'), 0, 800);
  const overlap = [hand('palm', { x: 0.49 }), hand('palm', { x: 0.51 })];
  const uncertain: InteractionEvent[] = [];
  for (let t = 840; t <= 1200; t += 40)
    uncertain.push(...ambiguous.update(overlap, t).events);
  assert.deepEqual(
    uncertain.map((e) => e.phase),
    ['cancel'],
  );
});

void test('opposite hand at the same position cannot release an active offer', () => {
  for (const handedness of ['Left', 'Right'] as const) {
    const controller = new GestureController();
    hold(controller, hand('pinch', { handedness }), 0, 800);
    const replacement = hand('palm', {
      handedness: handedness === 'Left' ? 'Right' : 'Left',
    });
    const events = hold(controller, replacement, 840, 1000);
    assert.deepEqual(
      events.map((e) => e.phase),
      ['cancel'],
    );
  }
});

void test('natural pinches work with the other three fingers extended on either hand', () => {
  for (const handedness of ['Left', 'Right'] as const) {
    const controller = new GestureController();
    const pinch = hand('pinch', { handedness });
    const palm = hand('palm', { handedness });
    for (let i = 9; i < 21; i++) {
      pinch.landmarks[i] = palm.landmarks[i];
      pinch.worldLandmarks![i] = palm.worldLandmarks![i];
    }
    const events = hold(controller, pinch, 0, 800);
    assert.equal(
      events.filter((e) => e.intent === 'OFFER_NECTAR' && e.phase === 'start')
        .length,
      1,
    );
    const release = hold(controller, palm, 840, 400);
    assert.equal(commits(release).length, 1);
    assert.equal(commits(release)[0].intent, 'OFFER_NECTAR');
  }
});

void test('a missing observation interrupts release dwell without committing nectar', () => {
  const controller = new GestureController();
  hold(controller, hand('pinch'), 0, 800);
  assert.equal(controller.update([hand('palm')], 840).events.length, 0);
  assert.equal(controller.update([], 920).events.length, 0);
  assert.equal(controller.update([hand('palm')], 960).events.length, 0);
  assert.equal(controller.update([hand('palm')], 1040).events.length, 0);
  assert.equal(
    commits(controller.update([hand('palm')], 1080).events).length,
    1,
  );
});

void test('a frame arriving after a tracking stall cancels instead of completing an old release', () => {
  const controller = new GestureController();
  hold(controller, hand('pinch'), 0, 800);
  controller.update([hand('palm')], 840);
  assert.deepEqual(
    controller.update([hand('palm')], 1200).events.map((e) => e.phase),
    ['cancel'],
  );
  assert.equal(hold(controller, hand('palm'), 1240, 1000).length, 0);
});

void test('missing observations interrupt pose dwell and never repeat a held Stop', () => {
  const controller = new GestureController();
  hold(controller, hand('neutral'), 0, 400);
  controller.update([hand('thumb')], 440);
  controller.update([], 560);
  assert.equal(controller.update([hand('thumb')], 600).events.length, 0);
  assert.equal(controller.update([hand('thumb')], 760).events.length, 0);
  assert.equal(
    controller.update([hand('thumb')], 840).events[0]?.intent,
    'THUMBS_UP',
  );
  const stopped = new GestureController();
  assert.equal(commits(hold(stopped, hand('palm'), 0, 1000)).length, 1);
  stopped.update([], 1040);
  assert.equal(hold(stopped, hand('palm'), 1080, 1000).length, 0);
});

void test('removing an ordinary command hand allows a fresh sign; reset still requires visible neutral', () => {
  const controller = new GestureController();
  assert.equal(commits(hold(controller, hand('thumb'), 0, 800)).length, 1);
  hold(controller, null, 840, 600);
  assert.equal(commits(hold(controller, hand('thumb'), 1480, 800)).length, 1);
  controller.reset(2320);
  hold(controller, null, 2360, 600);
  assert.equal(hold(controller, hand('thumb'), 3000, 800).length, 0);
});

void test('malformed geometry and duplicate or delayed frames cannot create commands', () => {
  const invalidWorld = hand('pinch');
  invalidWorld.worldLandmarks![8].x = NaN;
  assert.equal(extractHandFeatures(invalidWorld), null);
  assert.equal(extractHandFeatures(hand('pinch'), NaN), null);
  const controller = new GestureController();
  hold(controller, hand('pinch'), 0, 800);
  for (const time of [NaN, Infinity, 800, 600])
    assert.equal(controller.update([hand('palm')], time).events.length, 0);
  assert.equal(controller.update([hand('palm')], 840).events.length, 0);
});

void test('manual takeover/reset cancels an offer and held poses cannot fire until neutral', () => {
  const controller = new GestureController();
  hold(controller, hand('pinch'), 0, 800);
  assert.deepEqual(
    controller.reset(840).map((e) => e.phase),
    ['cancel'],
  );
  assert.equal(hold(controller, hand('palm'), 880, 1400).length, 0);
  hold(controller, hand('neutral'), 2320, 300);
  assert.deepEqual(
    commits(hold(controller, hand('thumb'), 2660, 400)).map((e) => e.intent),
    ['THUMBS_UP'],
  );
});

void test('camera event phases are accepted by the shared action director', () => {
  const director = new ActionDirector();
  const controller = new GestureController();
  const greeting = commits(hold(controller, hand('thumb'), 0, 800));
  assert.equal(greeting.length, 1);
  assert.equal(director.dispatch(greeting[0]), true);
  assert.equal(director.snapshot.intent, 'THUMBS_UP');
  hold(controller, hand('neutral'), 840, 300);
  const offering = hold(controller, hand('pinch'), 1200, 400);
  for (const event of offering) assert.equal(director.dispatch(event), true);
  assert.equal(director.snapshot.nectar?.committed, false);
  const release = hold(controller, hand('palm'), 1640, 200);
  for (const event of release) assert.equal(director.dispatch(event), true);
  assert.equal(director.snapshot.nectar?.committed, true);
});
