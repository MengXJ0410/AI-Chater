import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, darkerColor, defaultAppearance, parseAppearance } from "@/lib/appearance";

describe("appearance preferences", () => {
  it("uses defaults for missing or invalid saved data", () => {
    expect(parseAppearance(null)).toEqual(defaultAppearance);
    expect(parseAppearance("not-json")).toEqual(defaultAppearance);
    expect(parseAppearance('{"accent":"blue"}')).toEqual(defaultAppearance);
  });

  it("keeps a valid color and supported image data URL", () => {
    const parsed = parseAppearance('{"accent":"#2f63c8","background":"data:image/webp;base64,AAAA"}');
    expect(parsed).toEqual({ accent: "#2f63c8", background: "data:image/webp;base64,AAAA", surfaceOpacity: 86, backgroundBlur: 0 });
  });

  it("keeps valid saved transparency and blur values", () => {
    const parsed = parseAppearance('{"accent":"#2f63c8","background":null,"surfaceOpacity":42,"backgroundBlur":12}');
    expect(parsed.surfaceOpacity).toBe(42);
    expect(parsed.backgroundBlur).toBe(12);
  });

  it("derives a darker primary action color", () => {
    expect(darkerColor(DEFAULT_ACCENT)).toBe("#0d4739");
  });
});
