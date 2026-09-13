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
  stride: number;
  tarsusBend: number;
  kneeBias: -1 | 1;
  /** 波浪步态相位偏移（0~1），决定该腿在步态周期中何时抬脚 */
  waveOffset: number;
};

export type SpiderLegPose = {
  hip: Point;
  knee: Point;
  ankle: Point;
  foot: Point;
  lift: number;
};

/** 单对足的参数（四对：前/中前/中后/后，左右自动镜像）。 */
export type SpiderPairTuning = {
  /** 股节长度 */
  femur: number;
  /** 胫节长度 */
  tibia: number;
  /** 跗节长度 */
  tarsus: number;
  /** 基准朝向（度，相对身体正前方） */
  restAngle: number;
  /** 髋部局部坐标 X */
  hipX: number;
  /** 髋部局部坐标 Y（自动镜像到左右侧） */
  hipY: number;
  /** 该对腿沿运动方向的前伸步幅倍率（0 表示不主动前伸） */
  stride: number;
  /** 跗节相对胫节的折角（度，0 为直线，负值反向） */
  tarsusBend: number;
  /** 膝/跗节弯曲侧：1 默认，-1 镜像 */
  kneeFlip: 1 | -1;
};

export type SpiderTuning = {
  /** 四对足的独立参数 */
  pairs: SpiderPairTuning[];
  /** 静止时腿的伸展比例（0~1）：越大腿越直、膝弯越小 */
  restReach: number;
  /** 移动时足端超过该伸展比例就抬脚重摆 */
  stepReach: number;
  /** 移动时足端方向与静止方向夹角超过该值（弧度）就抬脚重摆 */
  stepAngle: number;
  /** 抬脚时足端抬起的高度（px） */
  legLift: number;
  /** 单次摆动基础时长（秒，越小步频越快） */
  swingDuration: number;
  /** 全局基础步幅（会乘以每对腿的 stride 倍率） */
  stride: number;
  /** 朝向在单帧内变化超过该值（弧度）时，所有腿落点作废并重摆 */
  pivotAngle: number;
  /** 高速自适应参考速度（px/s）：越快摆动越快、步幅越大、容许转动越大 */
  gaitReference: number;
  /** 摆动时长随速度的收缩增益 */
  swingSpeedGain: number;
  /** 步幅随速度的增长增益 */
  strideSpeedGain: number;
  /** 容许转动角随速度的增长增益 */
  angleSpeedGain: number;
  /** 自适应转身阈值上限（弧度） */
  maxStepAngle: number;
  /** 波浪步态一个周期对应的地面位移（px） */
  waveStride: number;
  /** 波浪步态中允许抬脚的时间窗口占比（0~1） */
  waveWindow: number;
};

export const SPIDER_PAIR_LABELS = ["前足", "中前足", "中后足", "后足"] as const;

export const SPIDER_BODY_RADIUS = 27;
export const SPIDER_ABDOMEN_OFFSET = 20;
export const SPIDER_EDGE_PADDING = 22;

export const SPIDER_TUNING_STORAGE_KEY = "ai-chater-spider-tuning";
export const SPIDER_TUNING_QUERY_KEY = "spiderTuning";
export const SPIDER_TUNING_CHANGE_EVENT = "ai-chater:spider-tuning-change";

export const DEFAULT_SPIDER_TUNING: SpiderTuning = {
  pairs: [
    { femur: 24, tibia: 28, tarsus: 15, restAngle: 26, hipX: 6, hipY: 5, stride: 1, tarsusBend: 20, kneeFlip: 1 },
    { femur: 27, tibia: 31, tarsus: 17, restAngle: 62, hipX: 3, hipY: 6.5, stride: 0.9, tarsusBend: 20, kneeFlip: 1 },
    { femur: 27, tibia: 31, tarsus: 17, restAngle: 104, hipX: -1, hipY: 6.5, stride: 0.9, tarsusBend: 20, kneeFlip: 1 },
    { femur: 30, tibia: 34, tarsus: 19, restAngle: 150, hipX: -5, hipY: 5, stride: 0.95, tarsusBend: 20, kneeFlip: 1 },
  ],
  restReach: 0.6,
  stepReach: 0.9,
  stepAngle: 0.9,
  legLift: 7,
  swingDuration: 0.17,
  stride: 0.32,
  pivotAngle: 0.6,
  gaitReference: 150,
  swingSpeedGain: 0.6,
  strideSpeedGain: 1,
  angleSpeedGain: 1.1,
  maxStepAngle: 2.6,
  waveStride: 52,
  waveWindow: 0.5,
};

function numberOr(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function mirrorOr(value: unknown, fallback: 1 | -1): 1 | -1 {
  return value === 1 || value === -1 ? value : fallback;
}

function pairOr(value: unknown, fallback: SpiderPairTuning): SpiderPairTuning {
  if (!value || typeof value !== "object") return { ...fallback };
  const record = value as Record<string, unknown>;
  return {
    femur: numberOr(record.femur, fallback.femur, 4, 120),
    tibia: numberOr(record.tibia, fallback.tibia, 4, 140),
    tarsus: numberOr(record.tarsus, fallback.tarsus, 2, 80),
    restAngle: numberOr(record.restAngle, fallback.restAngle, -180, 360),
    hipX: numberOr(record.hipX, fallback.hipX, -60, 60),
    hipY: numberOr(record.hipY, fallback.hipY, -60, 60),
    stride: numberOr(record.stride, fallback.stride, 0, 4),
    tarsusBend: numberOr(record.tarsusBend, fallback.tarsusBend, -120, 120),
    kneeFlip: mirrorOr(record.kneeFlip, fallback.kneeFlip),
  };
}

/** 把任意来源的对象规范化为完整调参，非法字段回退默认值。 */
export function normalizeSpiderTuning(value: unknown): SpiderTuning {
  const base = DEFAULT_SPIDER_TUNING;
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const sourcePairs = Array.isArray(record.pairs) ? (record.pairs as unknown[]) : [];
  return {
    pairs: base.pairs.map((pair, index) => pairOr(sourcePairs[index], pair)),
    restReach: numberOr(record.restReach, base.restReach, 0.2, 1),
    stepReach: numberOr(record.stepReach, base.stepReach, 0.3, 1.4),
    stepAngle: numberOr(record.stepAngle, base.stepAngle, 0, Math.PI),
    legLift: numberOr(record.legLift, base.legLift, 0, 60),
    swingDuration: numberOr(record.swingDuration, base.swingDuration, 0.03, 1.5),
    stride: numberOr(record.stride, base.stride, 0, 2),
    pivotAngle: numberOr(record.pivotAngle, base.pivotAngle, 0, Math.PI),
    gaitReference: numberOr(record.gaitReference, base.gaitReference, 20, 800),
    swingSpeedGain: numberOr(record.swingSpeedGain, base.swingSpeedGain, 0, 4),
    strideSpeedGain: numberOr(record.strideSpeedGain, base.strideSpeedGain, 0, 4),
    angleSpeedGain: numberOr(record.angleSpeedGain, base.angleSpeedGain, 0, 4),
    maxStepAngle: numberOr(record.maxStepAngle, base.maxStepAngle, 0, Math.PI),
    waveStride: numberOr(record.waveStride, base.waveStride, 5, 400),
    waveWindow: numberOr(record.waveWindow, base.waveWindow, 0.05, 1),
  };
}

/**
 * 解析可选的运行时调参（无需重新构建）：
 * 1) localStorage["ai-chater-spider-tuning"] = JSON
 * 2) 页面查询串 ?spiderTuning=<encodeURIComponent(JSON)>
 * 查询串优先级高于 localStorage，非法字段回退默认值。
 */
export function resolveSpiderTuning(stored: string | null, query: string | null): SpiderTuning {
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
  return normalizeSpiderTuning(override);
}

function loadSpiderTuning(): SpiderTuning {
  if (typeof window === "undefined") return normalizeSpiderTuning({});
  let query: string | null = null;
  try {
    query = new URLSearchParams(window.location.search).get(SPIDER_TUNING_QUERY_KEY);
  } catch {
    query = null;
  }
  return resolveSpiderTuning(window.localStorage.getItem(SPIDER_TUNING_STORAGE_KEY), query);
}

export const SPIDER_LEGS: SpiderLegDefinition[] = [];

let activeSpiderTuning: SpiderTuning = loadSpiderTuning();

function fillLegs(tuning: SpiderTuning) {
  let index = 0;
  for (const side of [-1, 1] as const) {
    for (let pair = 0; pair < 4; pair += 1) {
      const source = tuning.pairs[pair];
      const values: SpiderLegDefinition = {
        index,
        side,
        pair,
        hipX: source.hipX,
        hipY: source.hipY * side,
        femur: source.femur,
        tibia: source.tibia,
        tarsus: source.tarsus,
        restAngle: (source.restAngle * Math.PI) / 180,
        stride: source.stride,
        tarsusBend: source.tarsusBend,
        kneeBias: (side * source.kneeFlip) as -1 | 1,
        waveOffset: (pair * 0.25 + (side < 0 ? 0 : 0.5)) % 1,
      };
      if (SPIDER_LEGS[index]) Object.assign(SPIDER_LEGS[index], values);
      else SPIDER_LEGS.push(values);
      index += 1;
    }
  }
}

fillLegs(activeSpiderTuning);

export function getSpiderTuning(): SpiderTuning {
  return activeSpiderTuning;
}

function persistSpiderTuning(tuning: SpiderTuning) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPIDER_TUNING_STORAGE_KEY, JSON.stringify(tuning));
  } catch {
    // 存储不可用时仍然应用本次调参
  }
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

/** 应用一份完整调参并写入 localStorage。 */
export function setSpiderTuning(tuning: SpiderTuning): SpiderTuning {
  applySpiderTuning(tuning);
  persistSpiderTuning(tuning);
  return tuning;
}

/** 局部更新调参，写入 localStorage 并立即生效。 */
export function updateSpiderTuning(partial: Partial<SpiderTuning>): SpiderTuning {
  return setSpiderTuning({ ...activeSpiderTuning, ...partial });
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
  const defaults = normalizeSpiderTuning({});
  applySpiderTuning(defaults);
  return defaults;
}

export function legMaxReach(leg: SpiderLegDefinition) {
  return leg.femur + leg.tibia + leg.tarsus;
}

export function legStrideFactor(leg: SpiderLegDefinition) {
  return Math.max(0, leg.stride);
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
  tarsusBendDegrees = 20,
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
  const signedBend = (tarsusBendDegrees * Math.PI) / 180;
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
    const solved = solveLeg(hip, target, leg.femur, leg.tibia, leg.tarsus, leg.kneeBias, leg.tarsusBend);
    return { hip, knee: solved.knee, ankle: solved.ankle, foot: solved.foot, lift };
  });
}
