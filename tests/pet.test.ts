import { describe, expect, it } from "vitest";
import {
  createSpiderState,
  DEFAULT_SPIDER_TUNING,
  defaultPetPreferences,
  getSpiderTuning,
  groundY,
  hipPoint,
  legMaxReach,
  legStrideFactor,
  parsePetPreferences,
  pickWanderHeading,
  resolveSpiderTuning,
  resetSpiderTuning,
  restFootPoint,
  solveLeg,
  SPIDER_BODY_RADIUS,
  SPIDER_EDGE_PADDING,
  SPIDER_LENGTH,
  SPIDER_LEGS,
  SPIDER_SLEEP_AFTER_MS,
  stepSpider,
  strideTarget,
  turnToward,
  updateSpiderTuning,
  type SpiderState,
} from "@/client/pet";

const viewport = { width: 1400, height: 900 };
const random = () => 0.5;
const base = { viewport, dragging: false, activity: 70, elapsedMs: 16, pointer: null, random } as const;

describe("pet preferences", () => {
  it("falls back to defaults for missing or invalid data", () => {
    expect(parsePetPreferences(null)).toEqual(defaultPetPreferences);
    expect(parsePetPreferences("not-json")).toEqual(defaultPetPreferences);
    expect(parsePetPreferences("[]")).toEqual(defaultPetPreferences);
  });

  it("keeps a summoned spider and clamps activity", () => {
    expect(parsePetPreferences('{"kind":"spider","activity":175,"chaseCursor":false}')).toEqual({ kind: "spider", activity: 175, chaseCursor: false });
    expect(parsePetPreferences('{"kind":"spider","activity":500}').activity).toBe(defaultPetPreferences.activity);
    expect(parsePetPreferences('{"kind":"spider","activity":-5}').activity).toBe(defaultPetPreferences.activity);
  });

  it("rejects unknown pets and non-boolean chase flags", () => {
    expect(parsePetPreferences('{"kind":"dog"}').kind).toBeNull();
    expect(parsePetPreferences('{"kind":"spider","chaseCursor":"yes"}').chaseCursor).toBe(true);
  });
});

describe("spider legs", () => {
  it("places the rest foot at the configured fraction of the leg reach", () => {
    for (const leg of SPIDER_LEGS) {
      const hip = hipPoint(leg, 100, 100, 1);
      const foot = restFootPoint(leg, 100, 100, 1);
      expect(Math.hypot(foot.x - hip.x, foot.y - hip.y)).toBeCloseTo(legMaxReach(leg) * getSpiderTuning().restReach, 4);
    }
  });

  it("solves a three-bone leg while preserving every segment length", () => {
    const hip = { x: 0, y: 0 };
    const foot = { x: 30, y: 20 };
    const { knee, ankle, foot: solved } = solveLeg(hip, foot, 24, 28, 15, 1);
    expect(Math.hypot(knee.x - hip.x, knee.y - hip.y)).toBeCloseTo(24, 2);
    expect(Math.hypot(ankle.x - knee.x, ankle.y - knee.y)).toBeCloseTo(28, 2);
    expect(Math.hypot(solved.x - ankle.x, solved.y - ankle.y)).toBeCloseTo(15, 2);
    expect(Math.hypot(solved.x, solved.y)).toBeCloseTo(Math.hypot(30, 20), 2);
  });

  it("clamps an unreachable foot to the maximum extension and bends to the requested side", () => {
    const hip = { x: 0, y: 0 };
    const far = solveLeg(hip, { x: 1000, y: 0 }, 24, 28, 15, 1);
    expect(far.foot.x).toBeCloseTo(24 + 28 + 15, 1);
    expect(Math.hypot(far.knee.x, far.knee.y)).toBeCloseTo(24, 2);
    expect(Math.hypot(far.ankle.x - far.knee.x, far.ankle.y - far.knee.y)).toBeCloseTo(28, 2);
    expect(Math.hypot(far.foot.x - far.ankle.x, far.foot.y - far.ankle.y)).toBeCloseTo(15, 2);
    const surface = solveLeg(hip, { x: 30, y: 20 }, 24, 28, 15, 1);
    const under = solveLeg(hip, { x: 30, y: 20 }, 24, 28, 15, -1);
    expect(surface.knee.y).toBeGreaterThan(0);
    expect(under.knee.y).toBeLessThan(0);
  });

  it("biases stride forward for front legs and backward for rear legs", () => {
    const front = SPIDER_LEGS.find((leg) => leg.pair === 0)!;
    const rear = SPIDER_LEGS.find((leg) => leg.pair === 3)!;
    expect(legStrideFactor(front)).toBeGreaterThan(0.5);
    expect(legStrideFactor(rear)).toBeLessThan(-0.5);
  });

  it("aims the front legs ahead along the travel direction when moving", () => {
    const rest = { x: 0, y: 0 };
    const front = strideTarget(SPIDER_LEGS[0], rest, 200, 0, 60);
    const rear = strideTarget(SPIDER_LEGS[3], rest, 200, 0, 60);
    expect(front.x).toBeGreaterThan(0);
    expect(rear.x).toBeLessThan(0);
    expect(strideTarget(SPIDER_LEGS[0], rest, 0, 0, 60)).toEqual(rest);
  });

  it("instantiates eight independent legs with distinct geometry", () => {
    expect(SPIDER_LEGS).toHaveLength(8);
    expect(new Set(SPIDER_LEGS.map((leg) => leg.restAngle)).size).toBe(4);
    expect(SPIDER_LEGS.filter((leg) => leg.side === -1)).toHaveLength(4);
    expect(SPIDER_LEGS.filter((leg) => leg.side === 1)).toHaveLength(4);
  });

  it("rotates hip and foot geometry with the body heading", () => {
    const leg = SPIDER_LEGS[0];
    const hipZero = hipPoint(leg, 100, 100, 0);
    const hipQuarter = hipPoint(leg, 100, 100, Math.PI / 2);
    expect(hipQuarter.x).toBeCloseTo(100 - (hipZero.y - 100), 5);
    expect(hipQuarter.y).toBeCloseTo(100 + (hipZero.x - 100), 5);
    const footZero = restFootPoint(leg, 100, 100, 0);
    const footQuarter = restFootPoint(leg, 100, 100, Math.PI / 2);
    expect(Math.hypot(footQuarter.x - 100, footQuarter.y - 100)).toBeCloseTo(Math.hypot(footZero.x - 100, footZero.y - 100), 5);
  });
});

describe("spider steering", () => {
  it("turns toward a target by at most the step budget", () => {
    expect(turnToward(0, Math.PI / 2, 0.1)).toBeCloseTo(0.1, 6);
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05, 6);
    expect(turnToward(Math.PI - 0.05, -Math.PI + 0.05, 0.1)).toBeCloseTo(-Math.PI + 0.05, 6);
  });

  it("biases a fresh wander heading toward the pointer", () => {
    const towardPointer = pickWanderHeading(500, 500, viewport, 0, random);
    expect(Math.abs(towardPointer)).toBeLessThan(0.01);
    const free = pickWanderHeading(500, 500, viewport, null, random);
    expect(Math.abs(Math.abs(free) - Math.PI)).toBeLessThan(1e-6);
  });
});

describe("spider tuning", () => {
  it("merges runtime overrides and ignores invalid values", () => {
    const tuned = resolveSpiderTuning('{"tarsusBend":-25,"restReach":0.5,"kneeFlip":-1}', null);
    expect(tuned.tarsusBend).toBe(-25);
    expect(tuned.restReach).toBe(0.5);
    expect(tuned.kneeFlip).toBe(-1);

    const invalid = resolveSpiderTuning("not-json", '{"femur":[1,2],"legLift":"x"}');
    expect(invalid.femur).toEqual(DEFAULT_SPIDER_TUNING.femur);
    expect(invalid.legLift).toBe(DEFAULT_SPIDER_TUNING.legLift);
  });

  it("lets the query string win over localStorage", () => {
    expect(resolveSpiderTuning('{"restReach":0.9}', '{"restReach":0.4}').restReach).toBe(0.4);
  });

  it("applies live tuning updates to the leg geometry and resets", () => {
    try {
      updateSpiderTuning({ restReach: 0.5 });
      expect(getSpiderTuning().restReach).toBe(0.5);
      const leg = SPIDER_LEGS[0];
      const hip = hipPoint(leg, 100, 100, 0);
      const foot = restFootPoint(leg, 100, 100, 0);
      expect(Math.hypot(foot.x - hip.x, foot.y - hip.y)).toBeCloseTo(legMaxReach(leg) * 0.5, 4);
    } finally {
      resetSpiderTuning();
    }
    expect(getSpiderTuning().restReach).toBe(DEFAULT_SPIDER_TUNING.restReach);
  });
});

describe("spider state machine", () => {
  it("starts wandering, grounded and inside the viewport", () => {
    const created = createSpiderState(viewport);
    expect(created.status).toBe("wander");
    expect(created.y).toBeCloseTo(groundY(viewport), 5);
  });

  it("clamps to the viewport edges while wandering", () => {
    const out: SpiderState = { ...createSpiderState(viewport), status: "wander", x: -500, y: 99999, vx: -50, vy: 50 };
    const stepped = stepSpider(out, { ...base });
    expect(stepped.x).toBeGreaterThanOrEqual(SPIDER_BODY_RADIUS + SPIDER_EDGE_PADDING);
    expect(stepped.y).toBeLessThanOrEqual(groundY(viewport));
  });

  it("enters chase on a rapid click burst, then evades after reaching the pointer", () => {
    const trigger: SpiderState = { ...createSpiderState(viewport), status: "wander", x: 300, y: 300 };
    const chasing = stepSpider(trigger, { ...base, pointer: { x: 900, y: 300 }, chaseTrigger: true, chaseCursor: true });
    expect(chasing.status).toBe("chase");

    let state: SpiderState = { ...chasing, x: 700, y: 300, chaseSince: 0 };
    for (let step = 0; step < 200 && state.status === "chase"; step += 1) {
      state = stepSpider(state, { ...base, pointer: { x: 720, y: 300 }, chaseCursor: true });
    }
    expect(state.status).toBe("evade");
  });

  it("ignores the chase burst when chasing is disabled", () => {
    const trigger: SpiderState = { ...createSpiderState(viewport), status: "wander", x: 300, y: 300 };
    const stayed = stepSpider(trigger, { ...base, pointer: { x: 900, y: 300 }, chaseTrigger: true, chaseCursor: false });
    expect(stayed.status).toBe("wander");
  });

  it("evades when the pointer closes within one body length and relaxes past three", () => {
    const near: SpiderState = { ...createSpiderState(viewport), status: "wander", x: 500, y: 500 };
    const evading = stepSpider(near, { ...base, pointer: { x: 500 + SPIDER_LENGTH - 2, y: 500 } });
    expect(evading.status).toBe("evade");

    const far = stepSpider(evading, { ...base, pointer: { x: 1000, y: 800 } });
    expect(far.status).toBe("wander");
  });

  it("falls asleep after five minutes of wandering and wakes into evade", () => {
    const tired: SpiderState = { ...createSpiderState(viewport), status: "wander", wanderSince: SPIDER_SLEEP_AFTER_MS - 5 };
    const sleeping = stepSpider(tired, { ...base });
    expect(sleeping.status).toBe("sleep");

    const woken = stepSpider(sleeping, { ...base, pointer: null, wake: true });
    expect(woken.status).toBe("evade");

    const startled = stepSpider(sleeping, { ...base, pointer: { x: 900, y: 300 }, chaseTrigger: true, chaseCursor: true });
    expect(startled.status).toBe("chase");
  });

  it("moves through drag, fall and landing back to wandering", () => {
    let state: SpiderState = { ...createSpiderState(viewport), x: 400, y: 300 };
    state = stepSpider(state, { ...base, pointer: { x: 120, y: 90 }, dragging: true });
    expect(state.status).toBe("drag");
    expect(state.x).toBe(120);
    expect(state.y).toBe(90);

    state = stepSpider(state, { ...base, pointer: { x: 120, y: 90 }, dragging: false });
    expect(state.status).toBe("fall");

    let steps = 0;
    while (state.status === "fall" && steps < 400) {
      state = stepSpider(state, { ...base, elapsedMs: 50, pointer: null });
      steps += 1;
    }
    expect(state.status).toBe("wander");
  });

  it("keeps each planted stance foot fixed while the body travels", () => {
    const arena = { width: 4000, height: 3000 };
    const heading = Math.atan2(2800, 3600);
    let state: SpiderState = {
      ...createSpiderState(arena),
      status: "wander",
      x: 200,
      y: 200,
      heading,
      headingTarget: heading,
      headingTimer: 1_000_000,
    };
    const swung = new Set<number>();
    let sawPartialSwing = false;
    let stable = true;

    for (let frame = 0; frame < 700; frame += 1) {
      const next = stepSpider(state, { ...base, viewport: arena, pointer: null });
      const swinging = next.legs.filter((leg) => !leg.planted).length;
      if (swinging > 0 && swinging < 8) sawPartialSwing = true;
      next.legs.forEach((leg, index) => {
        if (!leg.planted) swung.add(index);
        const previous = state.legs[index];
        if (leg.planted && previous.planted) {
          if (Math.abs(leg.footX - previous.footX) > 1e-6 || Math.abs(leg.footY - previous.footY) > 1e-6) stable = false;
        }
      });
      state = next;
    }

    expect(sawPartialSwing).toBe(true);
    expect(swung.size).toBe(8);
    expect(stable).toBe(true);
  });
});
