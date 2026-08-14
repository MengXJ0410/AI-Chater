import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, darkerColor, defaultAppearance, deriveAccentTheme, deriveBubbleColor, getAppearancePanelVisibility, parseAppearance } from "@/lib/appearance";

describe("appearance preferences", () => {
  it("uses defaults for missing or invalid saved data", () => {
    expect(parseAppearance(null)).toEqual(defaultAppearance);
    expect(parseAppearance("not-json")).toEqual(defaultAppearance);
    expect(parseAppearance('{"accent":"blue"}')).toEqual(defaultAppearance);
  });

  it("keeps a valid color and supported image data URL", () => {
    const parsed = parseAppearance('{"accent":"#2f63c8","background":"data:image/webp;base64,AAAA"}');
    expect(parsed).toEqual({ accent: "#2f63c8", background: "data:image/webp;base64,AAAA", surfaceOpacity: 86, backgroundBlur: 0, bubbleColorRange: 60, bubbleActivity: 70 });
  });

  it("keeps valid saved transparency and blur values", () => {
    const parsed = parseAppearance('{"accent":"#2f63c8","background":null,"surfaceOpacity":42,"backgroundBlur":12}');
    expect(parsed.surfaceOpacity).toBe(42);
    expect(parsed.backgroundBlur).toBe(12);
    expect(parsed.bubbleColorRange).toBe(60);
    expect(parsed.bubbleActivity).toBe(70);
  });

  it("keeps valid bubble color and activity controls", () => {
    const parsed = parseAppearance('{"accent":"#2f63c8","bubbleColorRange":85,"bubbleActivity":175}');
    expect(parsed.bubbleColorRange).toBe(85);
    expect(parsed.bubbleActivity).toBe(175);
  });

  it("derives a darker primary action color", () => {
    expect(darkerColor(DEFAULT_ACCENT)).toBe("#0d4739");
  });

  it("derives a bubble color from independent RGB offsets", () => {
    expect(deriveBubbleColor("#64c864", { redFactor: -1 / 3, greenFactor: 1 / 3, blueFactor: -1 / 6 }, 60)).toMatchObject({
      primary: "#50dc5a",
    });
  });

  it("clamps bubble channels and chooses readable text", () => {
    expect(deriveAccentTheme("#f4f1b8").actionText).toBe("#121c19");
    expect(deriveAccentTheme("#171d35").actionText).toBe("#ffffff");
    expect(deriveBubbleColor("#f8f8f8", { redFactor: 1, greenFactor: 1, blueFactor: 1 }, 60)).toMatchObject({ primary: "#ffffff", text: "#121c19" });
    expect(deriveBubbleColor("#080808", { redFactor: -1, greenFactor: -1, blueFactor: -1 }, 60)).toMatchObject({ primary: "#000000", text: "#ffffff" });
  });

  it("keeps the same offsets when mapping a bubble to another theme", () => {
    const factors = { redFactor: -0.4, greenFactor: 23 / 30, blueFactor: 7 / 30 };
    expect(deriveBubbleColor("#64c864", factors, 30).primary).toBe("#58df6b");
    expect(deriveBubbleColor("#3264c8", factors, 30).primary).toBe("#267bcf");
  });

  it("scales one stable direction with the configured color range", () => {
    const factors = { redFactor: -0.5, greenFactor: 1, blueFactor: -0.25 };
    expect(deriveBubbleColor("#64c864", factors, 30).primary).toBe("#55e65d");
    expect(deriveBubbleColor("#64c864", factors, 60).primary).toBe("#46ff55");
  });

  it("shows only relevant controls for each page context", () => {
    expect(getAppearancePanelVisibility("/", false)).toEqual({ showBubbleControls: true, showBackgroundControls: true });
    expect(getAppearancePanelVisibility("/chat", true)).toEqual({ showBubbleControls: false, showBackgroundControls: true });
    expect(getAppearancePanelVisibility("/chat", false)).toEqual({ showBubbleControls: false, showBackgroundControls: false });
    expect(getAppearancePanelVisibility("/login", true)).toEqual({ showBubbleControls: false, showBackgroundControls: false });
    expect(getAppearancePanelVisibility("/settings", true)).toEqual({ showBubbleControls: false, showBackgroundControls: false });
  });
});
