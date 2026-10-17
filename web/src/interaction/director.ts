import { GESTURES, type Gesture } from '../simulation/types';
import { DEMO_DURATION_MS, DEMO_EVENTS } from './replay';
import {
  nectarPosition,
  nearestPerch,
  PERCHES,
  perchById,
  restingPosition,
  targetToWorld,
} from './world';
import type {
  ActorPose,
  DirectorSnapshot,
  InteractionEvent,
  Intent,
  Vec3,
} from './types';

type Plan = {
  kind: Intent;
  from: ActorPose;
  target: Vec3;
  elapsed: number;
  duration: number;
  delay: number;
  stage: 'travel' | 'feed' | 'groom' | 'stop';
  grounded: boolean;
  perchId?: string;
};
const clamp = (n: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, n));
const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const point = (a: Vec3, b: Vec3, t: number): Vec3 => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const clonePose = (p: ActorPose): ActorPose => ({
  ...p,
  position: [...p.position],
  attention: [...p.attention],
});
const angleMix = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const finiteTarget = (e: InteractionEvent) =>
  !e.target || (Number.isFinite(e.target.x) && Number.isFinite(e.target.y));
const atRestingContact = (pose: ActorPose) =>
  pose.flight < 0.1 &&
  PERCHES.some((perch) => {
    const rest = restingPosition(perch.id);
    return (
      Math.hypot(...pose.position.map((value, axis) => value - rest[axis])) <
      1e-5
    );
  });
const initialPose = (): ActorPose => ({
  position: restingPosition('leaf'),
  yaw: perchById('leaf').yaw,
  pitch: 0,
  roll: 0,
  flight: 0,
  feed: 0,
  groom: 0,
  attention: [0, 2, 5],
});
const LINES: Record<Intent, readonly string[]> = {
  WAVE: ['oh. you can see me?', 'hi again, enormous friend.'],
  POINT_LEFT: [
    'this way? tiny detour incoming.',
    'left. my other left. got it.',
  ],
  POINT_RIGHT: ['on my way. extremely small ETA.', 'taking the scenic route.'],
  COME: ['okay. but no sudden mammal moves.', 'closer? you smell interesting.'],
  STOP: ['staying. spectacularly.', 'hover mode: emotionally available.'],
  GO_AWAY: [
    'a little personal airspace. understood.',
    'i will be over here. dramatically.',
  ],
  MIDDLE_FINGER: [
    'rude. i am literally three millimeters.',
    'that is a very large opinion.',
  ],
  THUMBS_UP: ['you get me.', 'tiny creature. enormous approval.'],
  OFFER_NECTAR: ['is that... for me?', 'friendship has a flavor.'],
  VICTORY: ['watch this. i practiced zero times.', 'hold my nectar.'],
};

/** Authored companion actions. The real neural simulation never selects a trick. */
export class ActionDirector {
  readonly snapshot: DirectorSnapshot = {
    revision: 0,
    actionId: 'rest',
    intent: null,
    phase: 'resting',
    mood: 'curious',
    pose: initialPose(),
    nectar: null,
    bubble: null,
    time: 0,
    progress: 0,
    demo: false,
  };
  private plan: Plan | null = null;
  private reducedMotion = false;
  private neuralEvents: Gesture[] = [];
  private seen = new Set<string>();
  private sequence = 0;
  private lines = new Map<Intent, number>();
  private lureId: string | null = null;
  private demoIndex = 0;
  private startledUntil = 0;
  private anchor: Vec3 = restingPosition('leaf');
  private nectarSettling: { from: Vec3; to: Vec3; elapsed: number } | null =
    null;

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
  }
  drainNeuralEvents(): Gesture[] {
    const result = this.neuralEvents;
    this.neuralEvents = [];
    return result;
  }

  reset(): void {
    this.plan = null;
    this.neuralEvents = [];
    this.seen.clear();
    this.lines.clear();
    this.sequence = 0;
    this.lureId = null;
    this.demoIndex = 0;
    this.startledUntil = 0;
    this.nectarSettling = null;
    this.anchor = restingPosition('leaf');
    Object.assign(this.snapshot, {
      revision: this.snapshot.revision + 1,
      actionId: 'rest',
      intent: null,
      phase: 'resting',
      mood: 'curious',
      pose: initialPose(),
      nectar: null,
      bubble: null,
      time: 0,
      progress: 0,
      demo: false,
    });
  }

  startDemo(): void {
    this.reset();
    this.snapshot.demo = true;
  }
  stopDemo(): void {
    if (!this.snapshot.demo) return;
    this.snapshot.demo = false;
    this.lureId = null;
    this.snapshot.nectar = null;
    this.nectarSettling = null;
    this.begin('STOP');
    this.snapshot.revision++;
  }

  dispatch(event: InteractionEvent): boolean {
    if (
      !event.id ||
      !finiteTarget(event) ||
      !Object.hasOwn(LINES, event.intent)
    )
      return false;
    if (
      event.intent === 'OFFER_NECTAR' &&
      event.perchId !== undefined &&
      !PERCHES.some((p) => p.id === event.perchId)
    )
      return false;
    if (event.intent !== 'OFFER_NECTAR' && event.phase !== 'start')
      return false;
    if (
      event.intent === 'OFFER_NECTAR' &&
      event.phase !== 'start' &&
      this.lureId !== event.id
    )
      return false;
    const key = `${event.id}:${event.phase}`;
    if (event.phase !== 'update' && this.seen.has(key)) return false;
    if (event.source !== 'demo') this.snapshot.demo = false;
    if (event.phase !== 'update') {
      this.seen.add(key);
      if (this.seen.size > 512)
        this.seen.delete(this.seen.values().next().value!);
    }

    if (event.intent === 'OFFER_NECTAR') {
      if (event.phase === 'cancel') {
        this.lureId = null;
        this.snapshot.nectar = null;
        this.nectarSettling = null;
        this.begin('STOP');
        this.say('no rush. i can wait.');
        this.snapshot.revision++;
        return true;
      }
      if (event.phase === 'commit') {
        const id = event.perchId ?? this.snapshot.nectar?.perchId;
        if (!id || !PERCHES.some((p) => p.id === id)) return false;
        this.lureId = null;
        const from: Vec3 = this.snapshot.nectar
          ? [...this.snapshot.nectar.position]
          : nectarPosition(id);
        this.nectarSettling = { from, to: nectarPosition(id), elapsed: 0 };
        this.snapshot.nectar = {
          position: [...from],
          perchId: id,
          committed: true,
          amount: 1,
        };
        this.begin('OFFER_NECTAR', restingPosition(id), id, 3000);
        // Landing has an exact three-second window including any safe retraction.
        if (this.plan) {
          this.plan.duration = 3000 - this.plan.delay;
        }
        this.snapshot.actionId = event.id;
        this.say('a table for one. the very small one.');
        this.snapshot.revision++;
        return true;
      }
      const world = event.target
        ? targetToWorld(event.target)
        : nectarPosition(event.perchId ?? 'fruit');
      const perch = event.perchId
        ? perchById(event.perchId)
        : nearestPerch(world);
      this.nectarSettling = null;
      this.snapshot.nectar = {
        position: [...world],
        perchId: perch.id,
        committed: false,
        amount: 1,
      };
      const destination: Vec3 = [
        world[0] * 0.75,
        clamp(world[1] + 0.65, 1.65, 3.2),
        world[2],
      ];
      if (event.phase === 'start') {
        this.lureId = event.id;
        this.begin('OFFER_NECTAR', destination, undefined, 650);
        this.snapshot.actionId = event.id;
        this.speakIntent(event.intent);
      } else {
        this.begin('OFFER_NECTAR', destination, undefined, 180);
        this.snapshot.actionId = event.id;
      }
      this.snapshot.revision++;
      return true;
    }

    this.lureId = null;
    this.snapshot.nectar = null;
    this.nectarSettling = null;
    this.begin(event.intent);
    this.snapshot.actionId = event.id;
    if ((GESTURES as readonly string[]).includes(event.intent))
      this.neuralEvents.push(event.intent as Gesture);
    if (event.intent === 'MIDDLE_FINGER' || event.intent === 'GO_AWAY') {
      this.snapshot.mood = 'startled';
      this.startledUntil = this.snapshot.time + 4500;
    } else if (event.intent === 'THUMBS_UP') this.snapshot.mood = 'comfortable';
    this.speakIntent(event.intent);
    this.snapshot.revision++;
    return true;
  }

  private speakIntent(intent: Intent) {
    const count = this.lines.get(intent) ?? 0;
    this.lines.set(intent, count + 1);
    this.say(LINES[intent][count % LINES[intent].length]);
  }
  private say(text: string) {
    this.snapshot.bubble = {
      id: ++this.sequence,
      text,
      until: this.snapshot.time + 4200,
    };
  }

  private begin(
    kind: Intent,
    destination?: Vec3,
    perchId?: string,
    duration?: number,
  ): void {
    const s = this.snapshot;
    const from = clonePose(s.pose);
    // Wing folding starts before touchdown. Only an exact authored contact is
    // grounded; otherwise Stop must recover a hover, including late landings.
    const grounded = atRestingContact(from);
    const retracting =
      s.phase === 'feeding' ||
      s.phase === 'grooming' ||
      from.feed > 0.01 ||
      from.groom > 0.01;
    const continuingLure =
      kind === 'OFFER_NECTAR' &&
      this.plan?.kind === 'OFFER_NECTAR' &&
      !this.plan.perchId;
    const delay = retracting
      ? 320
      : grounded && kind !== 'STOP' && !continuingLure
        ? 180
        : 0;
    let target: Vec3 = destination ?? [...from.position];
    if (!destination) {
      if (kind === 'POINT_LEFT') target = [-2.15, 2.05, 0.65];
      if (kind === 'POINT_RIGHT') target = [2.15, 2.05, 0.65];
      if (kind === 'COME') target = [0, 2.05, 2.35];
      if (kind === 'GO_AWAY') {
        target = restingPosition('stone');
        perchId = 'stone';
      }
      if (kind === 'MIDDLE_FINGER')
        target = [from.position[0] > 0 ? -1.8 : 1.8, 2.75, -1.1];
      if (kind === 'WAVE') target = [0, 2.1, 1.0];
      if (kind === 'VICTORY')
        target = [clamp(from.position[0], -1, 1), 2.1, 0.5];
      if (kind === 'THUMBS_UP')
        target = [
          clamp(from.position[0], -2, 2),
          Math.max(1.85, from.position[1]),
          from.position[2],
        ];
      if (kind === 'STOP' && !grounded) target[1] = Math.max(target[1], 1.65);
    }
    this.plan = {
      kind,
      from,
      target,
      elapsed: 0,
      duration:
        duration ??
        (kind === 'STOP'
          ? 300
          : kind === 'VICTORY'
            ? 3200
            : kind === 'WAVE'
              ? 2500
              : kind === 'MIDDLE_FINGER'
                ? 1500
                : kind === 'THUMBS_UP'
                  ? 1400
                  : 1900),
      delay,
      stage: kind === 'STOP' ? 'stop' : 'travel',
      grounded,
      perchId,
    };
    s.intent = kind;
    s.progress = 0;
    s.phase =
      kind === 'OFFER_NECTAR' && !perchId
        ? 'offering'
        : delay
          ? 'anticipation'
          : kind === 'STOP'
            ? grounded
              ? 'resting'
              : 'hovering'
            : perchId
              ? 'landing'
              : 'flying';
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    let remaining = Math.min(deltaSeconds * 1000, 60_000);
    while (remaining > 1e-6) {
      if (this.snapshot.demo) {
        while (
          this.demoIndex < DEMO_EVENTS.length &&
          DEMO_EVENTS[this.demoIndex].time <= this.snapshot.time + 1e-6
        )
          this.dispatch(DEMO_EVENTS[this.demoIndex++]);
        if (this.snapshot.time >= DEMO_DURATION_MS) {
          this.snapshot.demo = false;
          this.snapshot.revision++;
        }
      }
      const nextEvent = this.snapshot.demo
        ? (DEMO_EVENTS[this.demoIndex]?.time ?? DEMO_DURATION_MS)
        : Infinity;
      const planBoundary = this.plan
        ? this.plan.delay + this.plan.duration - this.plan.elapsed
        : Infinity;
      const step = Math.min(
        remaining,
        20,
        Math.max(1e-6, nextEvent - this.snapshot.time),
        Math.max(1e-6, planBoundary),
      );
      this.snapshot.time += step;
      this.advance(step);
      remaining -= step;
    }
    if (this.snapshot.demo) {
      while (
        this.demoIndex < DEMO_EVENTS.length &&
        DEMO_EVENTS[this.demoIndex].time <= this.snapshot.time + 1e-6
      )
        this.dispatch(DEMO_EVENTS[this.demoIndex++]);
      if (this.snapshot.time >= DEMO_DURATION_MS - 1e-6) {
        this.snapshot.demo = false;
        this.snapshot.revision++;
      }
    }
  }

  private advance(delta: number): void {
    const s = this.snapshot;
    if (this.nectarSettling && s.nectar) {
      this.nectarSettling.elapsed += delta;
      const t = clamp(this.nectarSettling.elapsed / 450);
      s.nectar.position =
        t >= 1
          ? [...this.nectarSettling.to]
          : point(this.nectarSettling.from, this.nectarSettling.to, ease(t));
      if (t >= 1) this.nectarSettling = null;
    }
    if (s.bubble && s.time >= s.bubble.until) s.bubble = null;
    if (s.mood === 'startled' && s.time >= this.startledUntil)
      s.mood = 'curious';
    if (!this.plan) {
      s.pose.position = [...this.anchor];
      if (s.pose.flight > 0 && !this.reducedMotion)
        s.pose.position[1] = clamp(
          s.pose.position[1] + Math.sin(s.time / 420) * 0.035,
          0.55,
          3.65,
        );
      return;
    }
    const p = this.plan;
    p.elapsed += delta;
    if (p.elapsed < p.delay) {
      const t = ease(clamp(p.elapsed / p.delay));
      s.pose.feed = p.from.feed * (1 - t);
      s.pose.groom = p.from.groom * (1 - t);
      s.phase =
        p.kind === 'OFFER_NECTAR' && !p.perchId ? 'offering' : 'anticipation';
      return;
    }
    // Animation frame sums can finish a few picoseconds short of a stage.
    // Snap that numeric residue so exact 3/4/2-second phases are deterministic.
    const t =
      p.elapsed + 1e-6 >= p.delay + p.duration
        ? 1
        : clamp((p.elapsed - p.delay) / p.duration);
    const u = ease(t);
    s.progress = t;
    s.pose.feed = 0;
    s.pose.groom = 0;
    if (p.stage === 'feed' || p.stage === 'groom') {
      s.phase = p.stage === 'feed' ? 'feeding' : 'grooming';
      s.pose.position = [...p.target];
      s.pose.flight = 0;
      s.pose.yaw = perchById(p.perchId).yaw;
      s.pose.roll = 0;
      const envelope = Math.min(1, t * 8, (1 - t) * 8);
      s.pose.feed = p.stage === 'feed' ? envelope : 0;
      s.pose.groom = p.stage === 'groom' ? envelope : 0;
      s.pose.pitch = p.stage === 'feed' ? -0.13 * envelope : 0;
      if (s.nectar && p.stage === 'feed') s.nectar.amount = Math.max(0, 1 - t);
      if (t >= 1) this.complete();
      return;
    }
    if (p.stage === 'stop') {
      s.pose.position = point(p.from.position, p.target, u);
      s.pose.roll = p.from.roll * (1 - u);
      s.pose.pitch = p.from.pitch * (1 - u);
      s.pose.flight = p.grounded ? 0 : mix(p.from.flight, 1, u);
      s.phase = p.grounded ? 'resting' : 'hovering';
      if (t >= 1) this.complete();
      return;
    }
    s.phase = p.perchId
      ? 'landing'
      : p.kind === 'OFFER_NECTAR'
        ? 'offering'
        : 'flying';
    const position = point(p.from.position, p.target, u);
    const arc = Math.sin(Math.PI * t);
    if (p.perchId) position[1] += arc * 0.6;
    else if (p.kind !== 'OFFER_NECTAR')
      position[1] += arc * (this.reducedMotion ? 0.08 : 0.35);
    let roll = 0,
      pitch = -arc * 0.12;
    if (!this.reducedMotion) {
      if (p.kind === 'WAVE') {
        position[0] += Math.sin(t * Math.PI * 2) * arc * 0.95;
        position[2] += Math.sin(t * Math.PI) * 0.45;
        roll = Math.sin(t * Math.PI * 2) * 0.42;
      }
      if (p.kind === 'VICTORY') {
        position[1] += (1 - Math.cos(t * Math.PI * 2)) * 0.48;
        position[2] += Math.sin(t * Math.PI * 2) * 0.8;
        roll = Math.PI * 2 * u;
        pitch = Math.sin(t * Math.PI * 2) * 0.55;
      }
      if (p.kind === 'MIDDLE_FINGER') {
        position[1] += arc * 0.32;
        roll = -Math.sign(p.target[0] - p.from.position[0]) * arc * 0.65;
      }
      if (p.kind === 'THUMBS_UP') {
        position[1] += Math.sin(t * Math.PI * 2) * arc * 0.1;
        roll = Math.sin(t * Math.PI * 4) * arc * 0.24;
      }
      if (p.kind === 'POINT_LEFT' || p.kind === 'POINT_RIGHT') {
        const side = p.kind === 'POINT_LEFT' ? -1 : 1;
        // A second request at the edge still gets a visible outward-and-back
        // flourish, rather than a stationary action with no bank.
        const atEdge = Math.abs(p.target[0] - p.from.position[0]) < 0.6;
        if (atEdge)
          position[0] += side * Math.sin(t * Math.PI * 2) * arc * 0.45;
        roll = -side * (atEdge ? Math.sin(t * Math.PI * 2) : arc) * 0.38;
      }
    }
    s.pose.position = [
      clamp(position[0], -3, 3),
      clamp(position[1], 0.55, 3.65),
      clamp(position[2], -2.2, 2.6),
    ];
    const direction = Math.atan2(
      p.target[0] - p.from.position[0],
      p.target[2] - p.from.position[2],
    );
    const finalYaw = p.perchId ? perchById(p.perchId).yaw : 0;
    const travelYaw = angleMix(p.from.yaw, direction, Math.min(1, t * 4));
    s.pose.yaw = angleMix(travelYaw, finalYaw, ease(clamp((t - 0.55) / 0.45)));
    s.pose.roll = mix(p.from.roll, roll, Math.min(1, t * 6));
    s.pose.pitch = mix(p.from.pitch, pitch, Math.min(1, t * 6));
    s.pose.flight = p.perchId
      ? 1 - ease(clamp((t - 0.82) / 0.18))
      : mix(p.from.flight, 1, Math.min(1, t * 5));
    s.pose.attention = s.nectar ? [...s.nectar.position] : [0, 2, 5];
    if (t >= 1) this.complete();
  }

  private complete(): void {
    const p = this.plan!;
    const s = this.snapshot;
    s.pose.position = [...p.target];
    s.pose.feed = 0;
    s.pose.groom = 0;
    s.pose.roll = 0;
    s.pose.pitch = 0;
    if (p.perchId && p.stage === 'travel' && p.kind === 'OFFER_NECTAR') {
      p.stage = 'feed';
      p.elapsed = 0;
      p.delay = 0;
      p.duration = 4000;
      s.phase = 'feeding';
      s.pose.flight = 0;
      s.mood = 'comfortable';
      this.say('okay. we are friends now.');
    } else if (p.stage === 'feed') {
      p.stage = 'groom';
      p.elapsed = 0;
      p.duration = 2000;
      s.phase = 'grooming';
      s.nectar = null;
      this.say('one moment. tiny face maintenance.');
    } else {
      this.anchor = [...s.pose.position];
      s.phase =
        p.kind === 'OFFER_NECTAR' && this.lureId
          ? 'offering'
          : s.pose.flight < 0.1
            ? 'resting'
            : 'hovering';
      if (p.stage === 'groom') {
        s.phase = 'resting';
        s.pose.flight = 0;
      }
      this.plan = null;
    }
    s.revision++;
  }
}
