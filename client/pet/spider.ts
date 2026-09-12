import type { SpiderLegState, SpiderState } from "./types";

export type Point = { x: number; y: number };

export type SpiderLegDefinition = {
  index: number;
  side: -1 | 1;
  pair: number;
  hipX: number;
  hipY: number;
  femur: number;
  tibia: number;
  tarsus: number;
  restAngle: number;
  kneeBias: -1 | 1;
};

export type SpiderLegPose = {
  hip: Point;
  knee: Point;
  ankle: Point;
  foot: Point;
  lift: number;
};

export const SPIDER_BODY_RADIUS = 27;
export const SPIDER_ABDOMEN_OFFSET = 20;
export const SPIDER_EDGE_PADDING = 22;
export const SPIDER_REST_REACH = 0.6;
export const SPIDER_STEP_REACH = 0.9;
export const SPIDER_STEP_ANGLE = 0.9;
export const SPIDER_LEG_LIFT = 7;
export const SPIDER_TARSUS_BEND = (20 * Math.PI) / 180;
export const SPIDER_STRIDE = 0.3;

const PAIR_FEMUR = [24, 27, 27, 30];
const PAIR_TIBIA = [28, 31, 31, 34];
const PAIR_TARSUS = [15, 17, 17, 19];
const PAIR_REST_ANGLE = [26, 62, 104, 150];
const PAIR_HIP_X = [6, 3, -1, -5];
const PAIR_HIP_Y = [5, 6.5, 6.5, 5];

export const SPIDER_LEGS: SpiderLegDefinition[] = (() => {
  const legs: SpiderLegDefinition[] = [];
  for (const side of [-1, 1] as const) {
    for (let pair = 0; pair < 4; pair += 1) {
      legs.push({
        index: legs.length,
        side,
        pair,
        hipX: PAIR_HIP_X[pair],
        hipY: PAIR_HIP_Y[pair] * side,
        femur: PAIR_FEMUR[pair],
        tibia: PAIR_TIBIA[pair],
        tarsus: PAIR_TARSUS[pair],
        restAngle: (PAIR_REST_ANGLE[pair] * Math.PI) / 180,
        kneeBias: side,
      });
    }
  }
  return legs;
})();

export function legMaxReach(leg: SpiderLegDefinition) {
  return leg.femur + leg.tibia + leg.tarsus;
}

export function legStrideFactor(leg: SpiderLegDefinition) {
  return Math.cos(leg.restAngle);
}

export function hipPoint(leg: SpiderLegDefinition, x: number, y: number, heading: number): Point {
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  return { x: x + leg.hipX * cosine - leg.hipY * sine, y: y + leg.hipX * sine + leg.hipY * cosine };
}

export function restFootPoint(
  leg: SpiderLegDefinition,
  x: number,
  y: number,
  heading: number,
  reachScale = 1,
): Point {
  const reach = legMaxReach(leg) * SPIDER_REST_REACH * reachScale;
  const outward = legOutwardDirection(leg, heading);
  const hip = hipPoint(leg, x, y, heading);
  return { x: hip.x + outward.x * reach, y: hip.y + outward.y * reach };
}

export function legOutwardDirection(leg: SpiderLegDefinition, heading: number): Point {
  const localX = Math.cos(leg.restAngle);
  const localY = Math.sin(leg.restAngle) * leg.side;
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  return { x: localX * cosine - localY * sine, y: localX * sine + localY * cosine };
}

export function solveTwoBone(
  hip: Point,
  target: Point,
  upper: number,
  lower: number,
  kneeBias: -1 | 1,
): { knee: Point; end: Point } {
  const dx = target.x - hip.x;
  const dy = target.y - hip.y;
  const raw = Math.hypot(dx, dy) || 0.0001;
  const minimum = Math.abs(upper - lower) + 0.001;
  const maximum = upper + lower - 0.001;
  const distance = Math.min(maximum, Math.max(minimum, raw));
  const ux = dx / raw;
  const uy = dy / raw;
  const end = { x: hip.x + ux * distance, y: hip.y + uy * distance };
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const knee = {
    x: hip.x + ux * along - uy * height * kneeBias,
    y: hip.y + uy * along + ux * height * kneeBias,
  };
  return { knee, end };
}

export function solveLeg(
  hip: Point,
  foot: Point,
  femur: number,
  tibia: number,
  tarsus: number,
  kneeBias: -1 | 1,
): { knee: Point; ankle: Point; foot: Point } {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const raw = Math.hypot(dx, dy) || 0.0001;
  const total = femur + tibia + tarsus;
  const distance = Math.min(total - 0.001, raw);
  const ux = dx / raw;
  const uy = dy / raw;
  const clampedFoot = { x: hip.x + ux * distance, y: hip.y + uy * distance };

  const upper = femur + tibia;
  const cosLimit = (distance * distance + tarsus * tarsus - upper * upper) / (2 * distance * tarsus || 1);
  const maximumBend = Math.acos(Math.min(1, Math.max(-1, cosLimit)));
  const bend = Math.min(SPIDER_TARSUS_BEND, maximumBend) * kneeBias;
  const cosine = Math.cos(bend);
  const sine = Math.sin(bend);
  const ankle = {
    x: clampedFoot.x - tarsus * (ux * cosine - uy * sine),
    y: clampedFoot.y - tarsus * (ux * sine + uy * cosine),
  };
  const solved = solveTwoBone(hip, ankle, femur, tibia, kneeBias);
  return { knee: solved.knee, ankle: solved.end, foot: clampedFoot };
}

export function createLegState(
  leg: SpiderLegDefinition,
  x: number,
  y: number,
  heading: number,
): SpiderLegState {
  const foot = restFootPoint(leg, x, y, heading);
  return {
    footX: foot.x,
    footY: foot.y,
    planted: true,
    swing: 0,
    stepFromX: foot.x,
    stepFromY: foot.y,
    stepToX: foot.x,
    stepToY: foot.y,
  };
}

export function poseSpider(state: SpiderState): SpiderLegPose[] {
  return SPIDER_LEGS.map((leg, index) => {
    const legState = state.legs[index] ?? createLegState(leg, state.x, state.y, state.heading);
    const hip = hipPoint(leg, state.x, state.y, state.heading);
    const lift = legState.planted ? 0 : Math.sin(Math.min(1, legState.swing) * Math.PI) * SPIDER_LEG_LIFT;
    const target = { x: legState.footX, y: legState.footY - lift };
    const solved = solveLeg(hip, target, leg.femur, leg.tibia, leg.tarsus, leg.kneeBias);
    return { hip, knee: solved.knee, ankle: solved.ankle, foot: solved.foot, lift };
  });
}
