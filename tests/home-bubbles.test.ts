import { describe, expect, it } from "vitest";
import {
  bubbleCountForWidth,
  containParticle,
  createBubbleVisuals,
  keepParticleOutsideRect,
  minimumBubbleSize,
  placeBubbleParticles,
  resolveParticleCollision,
  type BubbleParticle,
} from "@/lib/home-bubbles";

function particle(overrides: Partial<BubbleParticle> = {}): BubbleParticle {
  return {
    id: "bubble",
    term: "RAG",
    size: 100,
    redFactor: -0.3,
    greenFactor: 0.4,
    blueFactor: 0.1,
    gradientAngle: 135,
    preferredX: 0.5,
    preferredY: 0.5,
    speed: 8,
    heading: 0,
    wanderPhase: 0,
    wanderRate: 0.2,
    x: 100,
    y: 100,
    radius: 50,
    mass: 2500,
    vx: 8,
    vy: 0,
    squash: 0,
    squashAngle: 0,
    ...overrides,
  };
}

describe("home bubble visuals", () => {
  it("uses responsive bubble counts", () => {
    expect(bubbleCountForWidth(1440)).toBe(6);
    expect(bubbleCountForWidth(390)).toBe(4);
  });

  it("gives longer terms a larger readable minimum size", () => {
    expect(minimumBubbleSize("Transformer")).toBeGreaterThan(minimumBubbleSize("RAG"));
    expect(minimumBubbleSize("云端推理", true)).toBeGreaterThanOrEqual(62);
  });

  it("creates deterministic visual settings with an injected random source", () => {
    const visuals = createBubbleVisuals(["RAG", "Transformer"], () => 0.5);
    expect(visuals).toHaveLength(2);
    expect(visuals[0]).toMatchObject({ size: 92, redFactor: 0, greenFactor: 0, blueFactor: 0, gradientAngle: 150, preferredX: 0.5, preferredY: 0.51 });
    expect(visuals[1].size).toBeGreaterThanOrEqual(minimumBubbleSize("Transformer"));
  });

  it("keeps every independently generated channel factor within minus one and one", () => {
    const visuals = createBubbleVisuals(Array.from({ length: 20 }, (_, index) => `词${index}`));
    for (const visual of visuals) {
      expect(visual.redFactor).toBeGreaterThanOrEqual(-1);
      expect(visual.redFactor).toBeLessThanOrEqual(1);
      expect(visual.greenFactor).toBeGreaterThanOrEqual(-1);
      expect(visual.greenFactor).toBeLessThanOrEqual(1);
      expect(visual.blueFactor).toBeGreaterThanOrEqual(-1);
      expect(visual.blueFactor).toBeLessThanOrEqual(1);
    }
  });

  it("places desktop and mobile particles at the expected counts and sizes", () => {
    const visuals = createBubbleVisuals(Array.from({ length: 10 }, (_, index) => `词汇${index}`), () => 0.2);
    const safeRect = { left: 500, top: 250, right: 900, bottom: 550 };
    const desktop = placeBubbleParticles(visuals, { width: 1440, height: 900, padding: 14 }, safeRect, () => 0.1);
    const mobile = placeBubbleParticles(visuals, { width: 390, height: 844, padding: 8 }, { left: 60, top: 190, right: 330, bottom: 400 }, () => 0.1);
    expect(desktop).toHaveLength(6);
    expect(mobile).toHaveLength(4);
    expect(desktop.every((bubble) => bubble.size >= 72 && bubble.size <= 112)).toBe(true);
    expect(mobile.every((bubble) => bubble.size >= 62 && bubble.size <= 92)).toBe(true);
  });
});

describe("home bubble physics", () => {
  it("keeps particles within the viewport and reflects velocity", () => {
    const bubble = particle({ x: 20, vx: -8 });
    containParticle(bubble, { width: 400, height: 300, padding: 10 });
    expect(bubble.x).toBe(60);
    expect(bubble.vx).toBeGreaterThan(0);
  });

  it("pushes particles out of the hero content safe area", () => {
    const bubble = particle({ x: 170, y: 150, vx: 5 });
    const moved = keepParticleOutsideRect(bubble, { left: 140, top: 120, right: 260, bottom: 210 }, 10);
    expect(moved).toBe(true);
    expect(bubble.x <= 80 || bubble.x >= 320 || bubble.y <= 60 || bubble.y >= 270).toBe(true);
  });

  it("separates overlapping particles and gives the smaller one the larger speed change", () => {
    const large = particle({ id: "large", x: 100, radius: 70, mass: 4900, vx: 5 });
    const small = particle({ id: "small", x: 205, radius: 40, mass: 1600, vx: -5 });
    const largeStart = large.vx;
    const smallStart = small.vx;
    expect(resolveParticleCollision(large, small)).toBe(true);
    expect(Math.hypot(small.x - large.x, small.y - large.y)).toBeGreaterThanOrEqual(large.radius + small.radius + 4 - 0.001);
    expect(Math.abs(small.vx - smallStart)).toBeGreaterThan(Math.abs(large.vx - largeStart));
    expect(large.squash).toBeGreaterThan(0);
    expect(small.squash).toBeGreaterThan(0);
    expect(large.squash).toBeLessThanOrEqual(0.075);
    expect(small.squash).toBeLessThanOrEqual(0.075);
  });
});
