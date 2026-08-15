import { describe, expect, it } from "vitest";
import { canTrackChatPointer, clampPointerPoint, getFollowScrollTop, getGlowStyleValues, getPointerStrength, interpolatePointerPoint, isNearScrollBottom } from "@/lib/chat-ambient";

describe("chat ambient pointer", () => {
  it("keeps pointer coordinates inside the workbench", () => {
    expect(clampPointerPoint({ x: -20, y: 940 }, 1440, 900)).toEqual({ x: 0, y: 900 });
    expect(clampPointerPoint({ x: 720, y: 450 }, 1440, 900)).toEqual({ x: 720, y: 450 });
  });

  it("fades pointer strength by activity and distance", () => {
    expect(getPointerStrength(false, 0)).toBe(0);
    expect(getPointerStrength(true, 0)).toBe(1);
    expect(getPointerStrength(true, 0.35)).toBeCloseTo(0.65);
    expect(getPointerStrength(true, 2)).toBe(0);
  });

  it("disables pointer tracking for reduced motion and coarse pointers", () => {
    expect(canTrackChatPointer(false, false)).toBe(true);
    expect(canTrackChatPointer(true, false)).toBe(false);
    expect(canTrackChatPointer(false, true)).toBe(false);
  });

  it("smoothly advances the delayed pointer and clamps glow settings", () => {
    expect(interpolatePointerPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.2)).toEqual({ x: 20, y: 10 });
    expect(getGlowStyleValues(240, -10)).toEqual({ brightness: 2, motion: 0 });
  });

  it("follows only when the message list is near its bottom", () => {
    expect(isNearScrollBottom(700, 300, 1_000)).toBe(true);
    expect(isNearScrollBottom(600, 300, 1_000)).toBe(false);
    expect(getFollowScrollTop(1_000, 300)).toBe(700);
  });
});
