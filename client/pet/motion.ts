import {
  createLegState,
  getSpiderTuning,
  hipPoint,
  legMaxReach,
  legOutwardDirection,
  legStrideFactor,
  restFootPoint,
  SPIDER_BODY_RADIUS,
  SPIDER_EDGE_PADDING,
  SPIDER_LEGS,
  type Point,
} from "./spider";
import type { SpiderLegState, SpiderState } from "./types";

export type PetInput = {
  viewport: { width: number; height: number };
  pointer: Point | null;
  dragging: boolean;
  activity: number;
  elapsedMs: number;
  chaseCursor?: boolean;
  chaseTrigger?: boolean;
  wake?: boolean;
  random?: () => number;
};

export const SPIDER_LENGTH = 62;
export const SPIDER_WANDER_SPEED = 44;
export const SPIDER_CHASE_SPEED = 300;
export const SPIDER_EVADE_SPEED = 250;
export const SPIDER_SLEEP_AFTER_MS = 5 * 60 * 1000;
export const SPIDER_CHASE_TIMEOUT_MS = 3500;

const SPIDER_GRAVITY = 2400;
const SPIDER_ANCHOR_LENGTH = 150;
const SPIDER_EDGE_MARGIN = 150;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

export function normalizeAngle(angle: number) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function turnToward(current: number, target: number, maxStep: number) {
  const difference = normalizeAngle(target - current);
  if (Math.abs(difference) <= maxStep) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(difference) * maxStep);
}

export function groundY(viewport: { width: number; height: number }) {
  return Math.max(SPIDER_BODY_RADIUS, viewport.height - SPIDER_BODY_RADIUS - SPIDER_EDGE_PADDING);
}

export function pickWanderHeading(
  x: number,
  y: number,
  viewport: { width: number; height: number },
  pointerAngle: number | null,
  random: () => number,
): number {
  const angle = random() * Math.PI * 2;
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  if (pointerAngle !== null) {
    const bias = 0.55;
    dx = dx * (1 - bias) + Math.cos(pointerAngle) * bias;
    dy = dy * (1 - bias) + Math.sin(pointerAngle) * bias;
  }
  const bottom = groundY(viewport);
  const edge = 1.1;
  if (x < SPIDER_EDGE_MARGIN) dx += edge * (1 - x / SPIDER_EDGE_MARGIN);
  if (x > viewport.width - SPIDER_EDGE_MARGIN) dx -= edge * (1 - (viewport.width - x) / SPIDER_EDGE_MARGIN);
  if (y < SPIDER_EDGE_MARGIN) dy += edge * (1 - y / SPIDER_EDGE_MARGIN);
  if (y > bottom - SPIDER_EDGE_MARGIN) dy -= edge * (1 - (bottom - y) / SPIDER_EDGE_MARGIN);
  return Math.atan2(dy, dx);
}

export function createSpiderState(viewport: { width: number; height: number }): SpiderState {
  const x = Math.max(SPIDER_BODY_RADIUS, viewport.width - 150);
  const y = groundY(viewport);
  const heading = Math.PI * 0.75;
  return {
    status: "wander",
    x,
    y,
    vx: 0,
    vy: 0,
    legPhase: 0,
    heading,
    headingTarget: heading,
    headingTimer: 0,
    wanderPhase: 0,
    wanderSince: 0,
    chaseSince: 0,
    webAnchor: null,
    legs: SPIDER_LEGS.map((leg) => createLegState(leg, x, y, heading)),
  };
}

function danglingDirection(legIndex: number, heading: number): Point {
  const leg = SPIDER_LEGS[legIndex];
  const outward = legOutwardDirection(leg, heading);
  return normalize({ x: outward.x * 0.6, y: 0.9 });
}

export function strideTarget(
  leg: (typeof SPIDER_LEGS)[number],
  rest: Point,
  vx: number,
  vy: number,
  maxReach: number,
): Point {
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return rest;
  const forward = maxReach * getSpiderTuning().stride * legStrideFactor(leg) * (0.4 + Math.min(1, speed / 200));
  return { x: rest.x + (vx / speed) * forward, y: rest.y + (vy / speed) * forward };
}

function stepLegs(
  legs: SpiderLegState[],
  state: SpiderState,
  dt: number,
  random: () => number,
  activityScale: number,
  pivot: boolean,
): SpiderLegState[] {
  const moving = state.status === "wander" || state.status === "chase" || state.status === "evade";
  return SPIDER_LEGS.map((leg, index) => {
    const previous = legs[index] ?? createLegState(leg, state.x, state.y, state.heading);
    const hip = hipPoint(leg, state.x, state.y, state.heading);
    const maxReach = legMaxReach(leg);
    const reachScale = state.status === "sleep" ? 0.5 : moving ? 0.9 : 1;
    const rest = restFootPoint(leg, state.x, state.y, state.heading, reachScale);

    if (state.status === "drag") {
      const jitter = (random() - 0.5) * 16;
      const target = { x: rest.x + jitter, y: rest.y + jitter * 0.6 };
      return {
        ...previous,
        planted: false,
        swing: (previous.swing + dt * 7) % 1,
        footX: target.x,
        footY: target.y,
        stepFromX: target.x,
        stepFromY: target.y,
        stepToX: target.x,
        stepToY: target.y,
      };
    }

    if (state.status === "fall") {
      const direction = danglingDirection(index, state.heading);
      const target = { x: hip.x + direction.x * maxReach * 0.82, y: hip.y + direction.y * maxReach * 0.82 };
      return {
        ...previous,
        planted: false,
        swing: Math.min(1, previous.swing + dt * 4),
        footX: target.x,
        footY: target.y,
        stepFromX: target.x,
        stepFromY: target.y,
        stepToX: target.x,
        stepToY: target.y,
      };
    }

    if (previous.planted) {
      const reach = Math.hypot(previous.footX - hip.x, previous.footY - hip.y);
      const tooFar = reach > maxReach * 1.18;
      const footAngle = Math.atan2(previous.footY - hip.y, previous.footX - hip.x);
      const restAngle = Math.atan2(rest.y - hip.y, rest.x - hip.x);
      const angleError = Math.abs(normalizeAngle(footAngle - restAngle));
      const tuning = getSpiderTuning();
      const shouldStep = pivot || (moving && (reach > maxReach * tuning.stepReach || angleError > tuning.stepAngle)) || tooFar;
      if (shouldStep) {
        const stepTo = strideTarget(leg, rest, state.vx, state.vy, maxReach);
        return {
          ...previous,
          planted: false,
          swing: 0,
          stepFromX: previous.footX,
          stepFromY: previous.footY,
          stepToX: stepTo.x,
          stepToY: stepTo.y,
        };
      }
      const settle = moving ? 0 : state.status === "sleep" ? 0.08 : 0.03;
      return {
        ...previous,
        footX: previous.footX + (rest.x - previous.footX) * settle,
        footY: previous.footY + (rest.y - previous.footY) * settle,
      };
    }

    const swingDuration = getSpiderTuning().swingDuration / Math.max(0.6, 0.5 + activityScale * 0.5);
    const swing = previous.swing + dt / swingDuration;
    if (swing >= 1) {
      return { ...previous, planted: true, swing: 0, footX: previous.stepToX, footY: previous.stepToY };
    }
    const eased = swing * swing * (3 - 2 * swing);
    return {
      ...previous,
      swing,
      footX: previous.stepFromX + (previous.stepToX - previous.stepFromX) * eased,
      footY: previous.stepFromY + (previous.stepToY - previous.stepFromY) * eased,
    };
  });
}

export function stepSpider(state: SpiderState, input: PetInput): SpiderState {
  const random = input.random ?? Math.random;
  const dt = clamp(input.elapsedMs, 0, 50) / 1000;
  const viewport = input.viewport;
  const activityScale = clamp(input.activity / 70, 0, 2.6);
  const ground = groundY(viewport);
  const allowChase = input.chaseCursor !== false;

  let { status, x, y, vx, vy, heading, headingTarget, headingTimer, wanderPhase, wanderSince, chaseSince, webAnchor } = state;

  const pointer = input.pointer;
  const pointerDistance = pointer ? Math.hypot(pointer.x - x, pointer.y - y) : Number.POSITIVE_INFINITY;
  const pointerAngle = pointer ? Math.atan2(pointer.y - y, pointer.x - x) : null;

  if (input.dragging && pointer) {
    status = "drag";
    x = pointer.x;
    y = pointer.y;
    vx = 0;
    vy = 0;
    webAnchor = null;
  } else if (status === "drag") {
    status = "fall";
    vx = 0;
    vy = Math.max(vy, 40);
    if (y < ground - 160) webAnchor = { x, y: Math.max(0, y - 190) };
  }

  if (status === "fall") {
    if (webAnchor) {
      const restY = Math.min(ground, webAnchor.y + SPIDER_ANCHOR_LENGTH);
      vx += (webAnchor.x - x) * 30 * dt;
      vy += (restY - y) * 30 * dt;
      vx -= vx * 5.5 * dt;
      vy -= vy * 5.5 * dt;
      x += vx * dt;
      y += vy * dt;
      if (Math.abs(x - webAnchor.x) < 7 && Math.abs(y - restY) < 7 && Math.hypot(vx, vy) < 26) {
        webAnchor = null;
        status = "wander";
        vy = 0;
        heading = pointerAngle ?? heading;
        headingTarget = heading;
        headingTimer = 0;
      }
    } else {
      vy += SPIDER_GRAVITY * dt;
      x += vx * dt;
      y += vy * dt;
      if (y >= ground) {
        y = ground;
        vy = 0;
        vx *= 0.4;
        status = "wander";
        heading = Math.atan2(vy, vx) || heading;
        headingTarget = heading;
        headingTimer = 0;
      }
    }
  } else if (status !== "drag") {
    const chaseTrigger = Boolean(input.chaseTrigger) && allowChase;

    if (status === "sleep") {
      if (input.wake) {
        status = "evade";
        wanderSince = 0;
      } else if (chaseTrigger) {
        status = "chase";
        chaseSince = 0;
      }
    } else if (status === "chase") {
      if (!pointer) {
        status = "wander";
        wanderSince = 0;
      }
    } else if (status === "evade") {
      if (chaseTrigger) {
        status = "chase";
        chaseSince = 0;
      } else if (input.wake) {
        wanderSince = 0;
      } else if (pointer && pointerDistance > SPIDER_LENGTH * 3) {
        status = "wander";
        wanderSince = 0;
        headingTimer = 0;
      }
    } else {
      if (input.wake) {
        status = "evade";
        wanderSince = 0;
      } else if (pointer && pointerDistance < SPIDER_LENGTH) {
        status = "evade";
        wanderSince = 0;
      } else if (chaseTrigger) {
        status = "chase";
        chaseSince = 0;
      }
    }

    if (status === "sleep") {
      vx = 0;
      vy = 0;
    } else if (status === "chase") {
      if (pointer && pointerAngle !== null) {
        heading = turnToward(heading, pointerAngle, dt * 9);
        const speed = SPIDER_CHASE_SPEED * (0.5 + activityScale * 0.6);
        vx = Math.cos(heading) * speed;
        vy = Math.sin(heading) * speed;
        x += vx * dt;
        y += vy * dt;
        chaseSince += input.elapsedMs;
        if (pointerDistance < SPIDER_LENGTH * 0.75 || chaseSince > SPIDER_CHASE_TIMEOUT_MS) {
          status = "evade";
          wanderSince = 0;
        }
      } else {
        status = "wander";
        wanderSince = 0;
      }
    } else if (status === "evade") {
      if (pointer && pointerAngle !== null) {
        heading = turnToward(heading, pointerAngle + Math.PI, dt * 11);
      }
      const speed = SPIDER_EVADE_SPEED * (0.6 + activityScale * 0.5);
      vx = Math.cos(heading) * speed;
      vy = Math.sin(heading) * speed;
      x += vx * dt;
      y += vy * dt;
      if (pointer && pointerDistance > SPIDER_LENGTH * 3) {
        status = "wander";
        wanderSince = 0;
        headingTimer = 0;
      }
    } else {
      wanderSince += input.elapsedMs;
      wanderPhase += dt * (1.4 + activityScale * 0.6);
      headingTimer -= input.elapsedMs;
      if (headingTimer <= 0) {
        headingTarget = pickWanderHeading(x, y, viewport, pointerAngle, random);
        headingTimer = 900 + random() * 1400;
      }
      heading = turnToward(heading, headingTarget, dt * 1.7);
      const speed = SPIDER_WANDER_SPEED * (0.55 + 0.35 * Math.sin(wanderPhase)) * (0.5 + activityScale * 0.8);
      vx = Math.cos(heading) * speed;
      vy = Math.sin(heading) * speed;
      x += vx * dt;
      y += vy * dt;
      if (wanderSince >= SPIDER_SLEEP_AFTER_MS) {
        status = "sleep";
        vx = 0;
        vy = 0;
      }
    }
  }

  const minimumX = SPIDER_BODY_RADIUS + SPIDER_EDGE_PADDING;
  const maximumX = Math.max(minimumX, viewport.width - SPIDER_BODY_RADIUS - SPIDER_EDGE_PADDING);
  const minimumY = SPIDER_BODY_RADIUS + SPIDER_EDGE_PADDING;
  const clampedX = clamp(x, minimumX, maximumX);
  const clampedY = clamp(y, minimumY, ground);
  if (clampedX !== x) {
    heading = clampedX < x ? 0 : Math.PI;
    headingTarget = heading;
    headingTimer = 600;
    vx = 0;
  }
  if (clampedY !== y) {
    heading = clampedY < y ? Math.PI / 2 : -Math.PI / 2;
    headingTarget = heading;
    headingTimer = 600;
    vy = 0;
  }
  x = clampedX;
  y = clampedY;

  const pivot = Math.abs(normalizeAngle(heading - state.heading)) > getSpiderTuning().pivotAngle;

  const next: SpiderState = {
    status,
    x,
    y,
    vx,
    vy,
    legPhase: state.legPhase + dt * (1.5 + Math.min(6, Math.hypot(vx, vy) / 18)),
    heading,
    headingTarget,
    headingTimer,
    wanderPhase,
    wanderSince,
    chaseSince,
    webAnchor,
    legs: state.legs,
  };
  next.legs = stepLegs(state.legs, next, dt, random, activityScale, pivot);
  return next;
}
