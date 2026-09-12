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

export type SpiderTuning = {
  /** 每条腿（前→后对）的股节长度 */
  femur: number[];
  /** 每条腿（前→后对）的胫节长度 */
  tibia: number[];
  /** 每条腿（前→后对）的跗节长度 */
  tarsus: number[];
  /** 每条腿的基准朝向（度，相对身体正前方，前→后） */
  restAngle: number[];
  /** 髋部在身体局部坐标的 X（前→后） */
  hipX: number[];
  /** 髋部在身体局部坐标的 Y（前→后，自动镜像到左右） */
  hipY: number[];
  /** 静止时腿的伸展比例（0~1）：越大腿越直、膝弯越小 */
  restReach: number;
  /** 移动时足端超过该伸展比例就抬脚重摆 */
  stepReach: number;
  /** 移动时足端方向与静止方向夹角超过该值（弧度）就抬脚重摆 */
  stepAngle: number;
  /** 跗节相对胫节的折角（度，0 为一条直线，负值反向） */
  tarsusBend: number;
  /** 运动方向上前后腿的步幅系数 */
  stride: number;
  /** 抬脚时足端抬起的高度（px） */
  legLift: number;
  /** 膝/跗节的弯曲侧：1 保持默认，-1 整体镜像 */
  kneeFlip: 1 | -1;
};

export const SPIDER_TUNING_STORAGE_KEY = "ai-chater-spider-tuning";
export const SPIDER_TUNING_QUERY_KEY = "spiderTuning";

export const DEFAULT_SPIDER_TUNING: SpiderTuning = {
  femur: [24, 27, 27, 30],
  tibia: [28, 31, 31, 34],
  tarsus: [15, 17, 17, 19],
  restAngle: [26, 62, 104, 150],
  hipX: [6, 3, -1, -5],
  hipY: [5, 6.5, 6.5, 5],
  restReach: 0.6,
  stepReach: 0.9,
  stepAngle: 0.9,
  tarsusBend: 20,
  stride: 0.3,
  legLift: 7,
  kneeFlip: 1,
};

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arrayOr(value: unknown, fallback: number[]) {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? (value as number[])
    : fallback;
}

function mergeTuning(override: Record<string, unknown>): SpiderTuning {
  const base = DEFAULT_SPIDER_TUNING;
  return {
    femur: arrayOr(override.femur, base.femur),
    tibia: arrayOr(override.tibia, base.tibia),
    tarsus: arrayOr(override.tarsus, base.tarsus),
    restAngle: arrayOr(override.restAngle, base.restAngle),
    hipX: arrayOr(override.hipX, base.hipX),
    hipY: arrayOr(override.hipY, base.hipY),
    restReach: numberOr(override.restReach, base.restReach),
    stepReach: numberOr(override.stepReach, base.stepReach),
    stepAngle: numberOr(override.stepAngle, base.stepAngle),
    tarsusBend: numberOr(override.tarsusBend, base.tarsusBend),
    stride: numberOr(override.stride, base.stride),
    legLift: numberOr(override.legLift, base.legLift),
    kneeFlip: override.kneeFlip === -1 ? -1 : 1,
  };
}

/**
 * 解析可选的运行时调参（无需重新构建）：
 * 1) localStorage["ai-chater-spider-tuning"] = JSON
 * 2) 页面查询串 ?spiderTuning=<encodeURIComponent(JSON)>
 * 查询串优先级高于 localStorage，非法字段回退默认值。
 */
export function resolveSpiderTuning(
  stored: string | null,
  query: string | null,
): SpiderTuning {
  const override: Record<string, unknown> = {};
  for (const source of [stored, query]) {
    if (!source) continue;
    try {
      const parsed: unknown = JSON.parse(source);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.assign(override, parsed);
    } catch {
      // 忽略非法 JSON，使用默认值
    }
  }
  return mergeTuning(override);
}

function loadSpiderTuning(): SpiderTuning {
  if (typeof window === "undefined") return { ...DEFAULT_SPIDER_TUNING, femur: [...DEFAULT_SPIDER_TUNING.femur], tibia: [...DEFAULT_SPIDER_TUNING.tibia], tarsus: [...DEFAULT_SPIDER_TUNING.tarsus], restAngle: [...DEFAULT_SPIDER_TUNING.restAngle], hipX: [...DEFAULT_SPIDER_TUNING.hipX], hipY: [...DEFAULT_SPIDER_TUNING.hipY] };
  let query: string | null = null;
  try {
    query = new URLSearchParams(window.location.search).get(SPIDER_TUNING_QUERY_KEY);
  } catch {
    query = null;
  }
  return resolveSpiderTuning(window.localStorage.getItem(SPIDER_TUNING_STORAGE_KEY), query);
}

export const SPIDER_TUNING_CHANGE_EVENT = "ai-chater:spider-tuning-change";

export const SPIDER_LEGS: SpiderLegDefinition[] = [];

let activeSpiderTuning: SpiderTuning = loadSpiderTuning();

function fillLegs(tuning: SpiderTuning) {
  let index = 0;
  for (const side of [-1, 1] as const) {
    for (let pair = 0; pair < 4; pair += 1) {
      const values: SpiderLegDefinition = {
        index,
        side,
        pair,
        hipX: tuning.hipX[pair],
        hipY: tuning.hipY[pair] * side,
        femur: tuning.femur[pair],
        tibia: tuning.tibia[pair],
        tarsus: tuning.tarsus[pair],
        restAngle: (tuning.restAngle[pair] * Math.PI) / 180,
        kneeBias: (side * tuning.kneeFlip) as -1 | 1,
      };
      if (SPIDER_LEGS[index]) Object.assign(SPIDER_LEGS[index], values);
      else SPIDER_LEGS.push(values);
      index += 1;
    }
  }
}

fillLegs(activeSpiderTuning);

/** 当前生效的腿部调参（由默认值 + 运行时覆盖合并而来）。 */
export function getSpiderTuning(): SpiderTuning {
  return activeSpiderTuning;
}

function emitSpiderTuning(tuning: SpiderTuning) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SpiderTuning>(SPIDER_TUNING_CHANGE_EVENT, { detail: tuning }));
}

/** 应用一份完整调参（不持久化），并重建腿部骨架、通知订阅者。 */
export function applySpiderTuning(tuning: SpiderTuning): void {
  activeSpiderTuning = tuning;
  fillLegs(tuning);
  emitSpiderTuning(tuning);
}

/** 局部更新调参，写入 localStorage 并立即生效。 */
export function updateSpiderTuning(partial: Partial<SpiderTuning>): SpiderTuning {
  const next: SpiderTuning = { ...activeSpiderTuning, ...partial };
  applySpiderTuning(next);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SPIDER_TUNING_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 存储不可用时仍然应用本次调参
    }
  }
  return next;
}

/** 恢复默认调参并清除本地覆盖。 */
export function resetSpiderTuning(): SpiderTuning {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SPIDER_TUNING_STORAGE_KEY);
    } catch {
      // 忽略
    }
  }
  const defaults = mergeTuning({});
  applySpiderTuning(defaults);
  return defaults;
}

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
  const reach = legMaxReach(leg) * activeSpiderTuning.restReach * reachScale;
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
  const signedBend = (activeSpiderTuning.tarsusBend * Math.PI) / 180;
  const bend = Math.min(Math.abs(signedBend), maximumBend) * (signedBend < 0 ? -1 : 1) * kneeBias;
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
    const lift = legState.planted ? 0 : Math.sin(Math.min(1, legState.swing) * Math.PI) * activeSpiderTuning.legLift;
    const target = { x: legState.footX, y: legState.footY - lift };
    const solved = solveLeg(hip, target, leg.femur, leg.tibia, leg.tarsus, leg.kneeBias);
    return { hip, knee: solved.knee, ankle: solved.ankle, foot: solved.foot, lift };
  });
}
