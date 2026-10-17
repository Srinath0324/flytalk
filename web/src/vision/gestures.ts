import type { InteractionEvent, Intent, Point2 } from '../interaction/types';
import { nearestPerch, targetToWorld } from '../interaction/world';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}
export interface HandObservation {
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  handedness?: string;
  gesture?: { categoryName: string; score: number };
}
export interface HandFeatures {
  observation: HandObservation;
  center: Point2;
  scale: number;
  normal: Landmark;
  pinch: number;
  pinchEligible: boolean;
  target: Point2;
  middleExtended: boolean;
  pose: Intent | 'OPEN_PALM' | null;
}
export interface RecognitionUpdate {
  events: InteractionEvent[];
  hand: HandFeatures | null;
  label: string;
  progress: number;
  offering: boolean;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const distance = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const subtract = (a: Landmark, b: Landmark): Landmark => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: Landmark, b: Landmark) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Landmark) => Math.hypot(a.x, a.y, a.z);
const angle = (a: Landmark, b: Landmark, c: Landmark) => {
  const u = subtract(a, b),
    v = subtract(c, b);
  return (
    (Math.acos(
      clamp(dot(u, v) / Math.max(0.000001, length(u) * length(v)), -1, 1),
    ) *
      180) /
    Math.PI
  );
};

/** Geometry is hand-relative; only pointer/direction output is mirrored. */
export function extractHandFeatures(
  observation: HandObservation,
  aspect = 4 / 3,
): HandFeatures | null {
  const raw = observation.landmarks;
  if (
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    raw.length !== 21 ||
    raw.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))
  )
    return null;
  if (
    observation.worldLandmarks?.some(
      (p) => ![p.x, p.y, p.z].every(Number.isFinite),
    )
  )
    return null;
  const image = raw.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }));
  const points =
    observation.worldLandmarks?.length === 21
      ? observation.worldLandmarks
      : image;
  const palmWidth = distance(points[5], points[17]);
  const imageWidth = Math.hypot(
    image[5].x - image[17].x,
    image[5].y - image[17].y,
  );
  const imageLength = Math.hypot(
    image[0].x - image[9].x,
    image[0].y - image[9].y,
  );
  const scale = Math.sqrt(imageWidth * imageLength);
  if (palmWidth < 0.0001 || scale < 0.025) return null;
  const extended = (mcp: number) =>
    angle(points[mcp], points[mcp + 1], points[mcp + 3]) > 145 &&
    distance(points[0], points[mcp + 3]) >
      distance(points[0], points[mcp + 1]) + palmWidth * 0.05;
  const index = extended(5),
    middle = extended(9),
    ring = extended(13),
    pinky = extended(17);
  const u = subtract(points[5], points[0]),
    v = subtract(points[17], points[0]);
  const cross = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
  const normalLength = Math.max(0.000001, length(cross));
  const category =
    observation.gesture && observation.gesture.score >= 0.65
      ? observation.gesture.categoryName
      : null;
  let pose: HandFeatures['pose'] = null;
  const thumbUp =
    !index &&
    !middle &&
    !ring &&
    !pinky &&
    angle(points[2], points[3], points[4]) > 150 &&
    raw[4].y < raw[3].y - (imageLength / aspect) * 0.2 &&
    raw[4].y < raw[5].y &&
    distance(points[4], points[9]) > palmWidth * 0.85;
  if ((category === 'Thumb_Up' && !index && !middle) || thumbUp)
    pose = 'THUMBS_UP';
  else if (category === 'Victory' || (index && middle && !ring && !pinky))
    pose = 'VICTORY';
  else if (middle && !index && !ring && !pinky) pose = 'MIDDLE_FINGER';
  else if (
    (index && !middle && !ring && !pinky) ||
    category === 'Pointing_Up'
  ) {
    const dx = -(raw[8].x - raw[5].x) * aspect,
      dy = raw[8].y - raw[5].y;
    if (Math.abs(dx) > Math.abs(dy) * 1.1)
      pose = dx < 0 ? 'POINT_LEFT' : 'POINT_RIGHT';
    else if (dy < 0) pose = 'COME';
  } else if (category === 'Open_Palm' || (index && middle && ring && pinky))
    pose = 'OPEN_PALM';
  const palm = [0, 5, 9, 13, 17].map((i) => raw[i]);
  return {
    observation,
    center: {
      x: 1 - palm.reduce((s, p) => s + p.x, 0) / 5,
      y: palm.reduce((s, p) => s + p.y, 0) / 5,
    },
    scale,
    normal: {
      x: cross.x / normalLength,
      y: cross.y / normalLength,
      z: cross.z / normalLength,
    },
    pinch: distance(points[4], points[8]) / palmWidth,
    pinchEligible:
      category !== 'Closed_Fist' &&
      distance(points[0], points[8]) > distance(points[0], points[9]) * 0.85,
    target: {
      x: clamp((1 - (raw[4].x + raw[8].x) / 2 - 0.12) / 0.76),
      y: clamp(((raw[4].y + raw[8].y) / 2 - 0.12) / 0.76),
    },
    middleExtended: middle,
    pose,
  };
}

type Sample = { time: number; hand: HandFeatures };
const DISPLAY: Partial<Record<Intent, string>> = {
  WAVE: 'Hello!',
  POINT_LEFT: 'Left',
  POINT_RIGHT: 'Right',
  COME: 'Come closer',
  STOP: 'Stay',
  GO_AWAY: 'Shoo',
  MIDDLE_FINGER: 'Trouble',
  THUMBS_UP: 'Good fly',
  VICTORY: 'Show off',
};

/** All time is supplied by the caller, so recorded landmarks reproduce decisions. */
export class GestureController {
  private sequence = 0;
  private owner: HandFeatures | null = null;
  private candidate: HandFeatures | null = null;
  private candidateSince = 0;
  private lastSeen = -Infinity;
  private neutralSince: number | null = null;
  private rearm = false;
  private requireVisibleNeutral = false;
  private blockedPose: HandFeatures['pose'] = null;
  private lastIntent: Intent | null = null;
  private lastCommandTime = -Infinity;
  private pose: HandFeatures['pose'] = null;
  private poseSince = 0;
  private pendingPose: HandFeatures['pose'] = null;
  private pendingSince = 0;
  private pinchSince: number | null = null;
  private releaseSince: number | null = null;
  private offerId: string | null = null;
  private target: Point2 | null = null;
  private openHistory: Sample[] = [];
  private label = 'Show one hand';
  private lastProcessedTime = -Infinity;

  reset(time: number, requireNeutral = true): InteractionEvent[] {
    const events = this.offerId
      ? [this.event('OFFER_NECTAR', 'cancel', time, this.offerId)]
      : [];
    this.owner = this.candidate = null;
    this.lastSeen = -Infinity;
    this.rearm = requireNeutral;
    this.requireVisibleNeutral = requireNeutral;
    this.blockedPose = null;
    this.lastIntent = null;
    this.lastCommandTime = -Infinity;
    this.neutralSince = this.pinchSince = this.releaseSince = null;
    this.offerId = null;
    this.target = null;
    this.clearPose();
    this.label = requireNeutral
      ? 'Relax your hand to continue'
      : 'Show one hand';
    this.lastProcessedTime = time;
    return events;
  }

  private event(
    intent: Intent,
    phase: InteractionEvent['phase'],
    time: number,
    id?: string,
  ): InteractionEvent {
    return {
      id: id ?? `camera-${++this.sequence}`,
      intent,
      phase,
      time,
      source: 'camera',
      ...(intent === 'OFFER_NECTAR' && this.target
        ? { target: { ...this.target } }
        : {}),
    };
  }
  private clearPose() {
    this.pose = null;
    this.poseSince = 0;
    this.pendingPose = null;
    this.pendingSince = 0;
    this.openHistory = [];
  }
  private consume(intent?: Intent, time = 0) {
    this.rearm = true;
    this.blockedPose = this.pose;
    this.lastIntent = intent ?? null;
    this.lastCommandTime = time;
    this.neutralSince = null;
    this.pinchSince = this.releaseSince = null;
    this.clearPose();
  }
  private select(hands: HandFeatures[], time: number): HandFeatures | null {
    if (this.owner) {
      const owner = this.owner;
      // A different hand must never open the controlling hand's nectar offer.
      // Ambiguous handedness drops a frame instead of transferring ownership.
      const eligible = hands
        .filter(
          (hand) =>
            !owner.observation.handedness ||
            hand.observation.handedness === owner.observation.handedness,
        )
        .map((hand) => ({
          hand,
          cost: Math.hypot(
            hand.center.x - owner.center.x,
            hand.center.y - owner.center.y,
          ),
        }))
        .filter(
          ({ hand, cost }) =>
            cost < 0.24 &&
            hand.scale / owner.scale > 0.55 &&
            hand.scale / owner.scale < 1.8,
        )
        .sort((a, b) => a.cost - b.cost);
      if (
        !eligible.length ||
        (eligible.length > 1 && eligible[1].cost - eligible[0].cost < 0.045)
      )
        return null;
      this.owner = eligible[0].hand;
      return this.owner;
    }
    const hand = hands
      .filter(
        (h) =>
          h.center.x > 0.12 &&
          h.center.x < 0.88 &&
          h.center.y > 0.08 &&
          h.center.y < 0.92,
      )
      .sort((a, b) => b.scale - a.scale)[0];
    if (!hand) {
      this.candidate = null;
      return null;
    }
    if (
      !this.candidate ||
      Math.hypot(
        hand.center.x - this.candidate.center.x,
        hand.center.y - this.candidate.center.y,
      ) > 0.16 ||
      hand.observation.handedness !== this.candidate.observation.handedness
    ) {
      this.candidate = hand;
      this.candidateSince = time;
    }
    if (time - this.candidateSince < 120) return null;
    this.owner = hand;
    this.candidate = null;
    return hand;
  }

  update(
    observations: HandObservation[],
    time: number,
    aspect = 4 / 3,
  ): RecognitionUpdate {
    if (!Number.isFinite(time) || time <= this.lastProcessedTime)
      return {
        events: [],
        hand: this.owner,
        label: this.label,
        progress: 0,
        offering: this.offerId !== null,
      };
    this.lastProcessedTime = time;
    const events: InteractionEvent[] = [];
    // A stalled inference pipeline may resume without delivering an explicit
    // empty frame. Elapsed tracking loss still cancels an uncommitted offer.
    if (this.owner && time - this.lastSeen >= (this.offerId ? 200 : 650)) {
      const hadOffer = !!this.offerId;
      if (this.offerId)
        events.push(this.event('OFFER_NECTAR', 'cancel', time, this.offerId));
      this.offerId = null;
      this.owner = this.candidate = null;
      this.consume();
      this.requireVisibleNeutral ||= hadOffer;
      this.label = hadOffer
        ? 'Offer cancelled — show your hand and pinch again'
        : 'Show one hand';
    }
    const hands = observations
      .map((h) => extractHandFeatures(h, aspect))
      .filter((h): h is HandFeatures => h !== null);
    const hand = this.select(hands, time);
    const result = (progress = 0): RecognitionUpdate => ({
      events,
      hand,
      label: this.label,
      progress: clamp(progress),
      offering: this.offerId !== null,
    });
    if (!hand) {
      // Release always requires uninterrupted observations. Ordinary poses can
      // bridge one brief dropout; longer gaps erase pose and motion history.
      this.pinchSince = this.releaseSince = null;
      if (time - this.lastSeen > 100) this.clearPose();
      // No-hand time can release ordinary commands, but a held pinch on return
      // must still open before it is allowed to create another offer.
      if (!hands.length && !this.owner && !this.offerId) {
        if (this.neutralSince === null) this.neutralSince = time;
        else if (!this.requireVisibleNeutral && time - this.neutralSince >= 180)
          this.rearm = false;
      }
      return result();
    }
    this.lastSeen = time;
    // A natural pinch often leaves the other fingers extended. Thumb/index
    // contact owns the sequence regardless of the remaining finger pose.
    const pinched = hand.pinch <= 0.32 && hand.pinchEligible;
    if (this.rearm) {
      const neutral =
        hand.pose === null && (hand.pinch >= 0.4 || !hand.pinchEligible);
      if (!neutral) this.neutralSince = null;
      else if (this.neutralSince === null) this.neutralSince = time;
      else if (time - this.neutralSince >= 180) {
        this.rearm = false;
        this.requireVisibleNeutral = false;
        this.blockedPose = null;
        this.neutralSince = null;
        this.label = 'Ready — try a sign';
      }
      // Latch only the accepted pose, not the entire input system. A new
      // deliberate pose can replace it immediately through its own dwell.
      const differentPose =
        hand.pose !== null && hand.pose !== this.blockedPose;
      const palmMotion =
        hand.pose === 'OPEN_PALM' && this.blockedPose === 'OPEN_PALM';
      if (!this.requireVisibleNeutral && (differentPose || pinched)) {
        this.rearm = false;
        this.clearPose();
      } else if (!this.requireVisibleNeutral && palmMotion) {
        // A stopped palm can still wave or push. A held palm cannot stop twice.
      } else {
        this.label = this.requireVisibleNeutral
          ? 'Close your hand briefly to continue'
          : `${this.lastIntent ? (DISPLAY[this.lastIntent] ?? 'Gesture') : 'Gesture'} accepted · change pose, or close your hand to repeat`;
        return result(this.rearm ? 1 : 0);
      }
    }

    if (this.offerId) {
      if (hand.pinch >= 0.5) {
        if (this.releaseSince === null) this.releaseSince = time;
        if (time - this.releaseSince >= 120) {
          const event = this.event(
            'OFFER_NECTAR',
            'commit',
            time,
            this.offerId,
          );
          event.perchId = nearestPerch(targetToWorld(this.target!)).id;
          events.push(event);
          this.offerId = null;
          this.consume('OFFER_NECTAR', time);
          this.requireVisibleNeutral = true;
          this.label = 'Nectar offered. A little patience…';
        }
      } else {
        this.releaseSince = null;
        const previous = this.target ?? hand.target;
        this.target = {
          x: previous.x + (hand.target.x - previous.x) * 0.35,
          y: previous.y + (hand.target.y - previous.y) * 0.35,
        };
        events.push(this.event('OFFER_NECTAR', 'update', time, this.offerId));
        this.label = 'Move the nectar · open your fingers to feed';
      }
      return result(
        this.releaseSince === null ? 1 : (time - this.releaseSince) / 120,
      );
    }

    if (pinched) {
      this.clearPose();
      if (this.pinchSince === null) this.pinchSince = time;
      this.label = 'Pinch to offer nectar';
      if (time - this.pinchSince >= 180) {
        this.target = hand.target;
        this.offerId = `camera-offer-${++this.sequence}`;
        events.push(this.event('OFFER_NECTAR', 'start', time, this.offerId));
        this.label = 'Move the nectar · open your fingers to feed';
      }
      return result((time - this.pinchSince) / 180);
    }
    this.pinchSince = null;
    if (hand.pose !== this.pose) {
      if (hand.pose !== this.pendingPose) {
        this.pendingPose = hand.pose;
        this.pendingSince = time;
      }
      // Short classifier flickers do not erase an otherwise deliberate pose.
      // Never emit the old pose while the current frame disagrees with it.
      if (this.pose !== null && time - this.pendingSince < 100) return result();
      const since = this.pendingSince || time;
      this.clearPose();
      this.pose = hand.pose;
      this.poseSince = since;
    } else {
      this.pendingPose = hand.pose;
      this.pendingSince = time;
    }
    if (!hand.pose) {
      if (this.neutralSince === null) this.neutralSince = time;
      if (time - this.neutralSince >= 180) this.blockedPose = null;
      this.label = 'Ready — pinch to offer nectar';
      return result();
    }
    this.neutralSince = null;
    if (hand.pose !== 'OPEN_PALM') {
      if (hand.pose === this.blockedPose) {
        this.label = `${DISPLAY[hand.pose]} accepted · change pose, or close your hand to repeat`;
        return result(1);
      }
      this.label = DISPLAY[hand.pose] ?? 'Hold your sign';
      if (time - this.poseSince >= 220) {
        events.push(this.event(hand.pose, 'start', time));
        this.consume(hand.pose, time);
      }
      return result((time - this.poseSince) / 220);
    }

    this.label = 'Still palm: stay · wave: hello · push: shoo';
    if (
      this.rearm &&
      this.lastIntent !== 'STOP' &&
      time - this.lastCommandTime < 450
    )
      return result(1);
    this.openHistory.push({ time, hand });
    this.openHistory = this.openHistory.filter((s) => time - s.time <= 950);
    const history = this.openHistory;
    // Push requires a stable baseline, not wrist-relative landmark z.
    const base = history[0];
    const pushBase = history.find((sample) => time - sample.time <= 650)!;
    const baseline = history.filter(
      (s) => s.time >= pushBase.time && s.time - pushBase.time <= 150,
    );
    const baselineStable =
      baseline.length >= 2 &&
      baseline.at(-1)!.time - pushBase.time >= 80 &&
      baseline.every(
        (s) =>
          Math.abs(s.hand.scale / pushBase.hand.scale - 1) < 0.08 &&
          Math.hypot(
            (s.hand.center.x - pushBase.hand.center.x) * aspect,
            s.hand.center.y - pushBase.hand.center.y,
          ) /
            pushBase.hand.scale <
            0.25,
      );
    const pushDuration = time - pushBase.time - 150;
    if (
      baselineStable &&
      pushDuration >= 200 &&
      pushDuration <= 500 &&
      hand.scale / pushBase.hand.scale >= 1.3 &&
      Math.hypot(
        (hand.center.x - pushBase.hand.center.x) * aspect,
        hand.center.y - pushBase.hand.center.y,
      ) /
        pushBase.hand.scale <
        0.4 &&
      dot(hand.normal, pushBase.hand.normal) > 0.9
    ) {
      events.push(this.event('GO_AWAY', 'start', time));
      this.label = 'Shoo';
      this.consume('GO_AWAY', time);
      return result(1);
    }
    // Count substantial alternating excursions, not per-frame velocity noise.
    let direction = 0,
      reversals = 0,
      extreme = history[0].hand.center.x;
    for (const sample of history) {
      const delta =
        ((sample.hand.center.x - extreme) * aspect) / base.hand.scale;
      if (!direction && Math.abs(delta) >= 0.65) {
        direction = Math.sign(delta);
        extreme = sample.hand.center.x;
      } else if (direction && Math.sign(delta) === direction)
        extreme = sample.hand.center.x;
      else if (direction && Math.abs(delta) >= 0.65) {
        direction *= -1;
        extreme = sample.hand.center.x;
        reversals++;
      }
    }
    if (reversals >= 2) {
      events.push(this.event('WAVE', 'start', time));
      this.label = 'Hello!';
      this.consume('WAVE', time);
      return result(1);
    }
    const recent = history.filter((s) => time - s.time <= 450);
    const stable =
      recent.length >= 3 &&
      time - recent[0].time >= 300 &&
      recent.every(
        (s) =>
          Math.hypot(
            (s.hand.center.x - hand.center.x) * aspect,
            s.hand.center.y - hand.center.y,
          ) /
            hand.scale <
            0.12 && Math.abs(s.hand.scale / hand.scale - 1) < 0.08,
      );
    if (stable && this.blockedPose !== 'OPEN_PALM') {
      events.push(this.event('STOP', 'start', time));
      this.consume('STOP', time);
      this.label = 'Stay';
    }
    return result((time - this.poseSince) / 300);
  }
}
