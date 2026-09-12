import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, darkerColor, defaultAppearance, deriveAccentTheme, deriveBubbleColor, getAppearancePanelVisibility, getBackgroundStrength, getChatFontLabel, getChatFontScale, parseAppearance, resolveAppearanceMode } from "@/client/appearance";
import { CHAT_ENTRY_TOKEN_TTL_MS, createChatEntryToken, isPendingChatEntry, isPlainPrimaryClick } from "@/client/chat-entry-transition";

describe("appearance preferences", () => {
  it("uses defaults for missing or invalid saved data", () => {
    expect(parseAppearance(null)).toEqual(defaultAppearance);
    expect(parseAppearance("not-json")).toEqual(defaultAppearance);
    expect(parseAppearance('{"accent":"blue"}')).toEqual(defaultAppearance);
  });

  it("keeps a valid color and supported image data URL", () => {
    const parsed = parseAppearance('{"accent":"#2f63c8","background":"data:image/webp;base64,AAAA"}');
    expect(parsed).toEqual({ colorMode: "system", accent: "#2f63c8", background: "data:image/webp;base64,AAAA", surfaceOpacity: 86, backgroundBlur: 0, bubbleColorRange: 60, bubbleActivity: 70, chatGlowBrightness: 85, chatGlowMotion: 100, chatFontSize: 2 });
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

  it("fills and bounds chat glow controls", () => {
    expect(parseAppearance('{"chatGlowBrightness":220,"chatGlowMotion":-5}')).toMatchObject({ chatGlowBrightness: 85, chatGlowMotion: 100 });
    expect(parseAppearance('{"chatGlowBrightness":120,"chatGlowMotion":35}')).toMatchObject({ chatGlowBrightness: 120, chatGlowMotion: 35 });
  });

  it("maps the five chat font size presets", () => {
    expect([0, 1, 2, 3, 4].map(getChatFontScale)).toEqual([0.4, 0.8, 1, 1.2, 1.6]);
    expect([0, 1, 2, 3, 4].map(getChatFontLabel)).toEqual(["极小", "小", "默认", "大", "极大"]);
    expect(getChatFontScale(99)).toBe(1.6);
    expect(getChatFontLabel(-2)).toBe("极小");
  });

  it("migrates existing preferences to system mode and resolves system color preference", () => {
    expect(parseAppearance('{"accent":"#2f63c8"}').colorMode).toBe("system");
    expect(resolveAppearanceMode("system", false)).toBe("light");
    expect(resolveAppearanceMode("system", true)).toBe("dark");
    expect(resolveAppearanceMode("light", true)).toBe("light");
    expect(resolveAppearanceMode("dark", false)).toBe("dark");
  });

  it("maps the background display strength to a bounded opacity", () => {
    expect(getBackgroundStrength(20)).toBe(0.2);
    expect(getBackgroundStrength(86)).toBe(0.86);
    expect(getBackgroundStrength(140)).toBe(1);
    expect(getBackgroundStrength(-20)).toBe(0);
  });

  it("derives a darker primary action color", () => {
    expect(darkerColor("#12634f")).toBe("#0d4739");
    expect(darkerColor(DEFAULT_ACCENT)).not.toBe(DEFAULT_ACCENT);
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

  it("derives mode-aware accent surfaces without changing action contrast", () => {
    const light = deriveAccentTheme(DEFAULT_ACCENT, "light");
    const dark = deriveAccentTheme(DEFAULT_ACCENT, "dark");
    expect(light.soft).not.toBe(dark.soft);
    expect(light.actionText).toBe(dark.actionText);
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
    expect(getAppearancePanelVisibility("/", false)).toEqual({ showBubbleControls: true, showBackgroundControls: true, showChatGlowControls: false });
    expect(getAppearancePanelVisibility("/chat", true)).toEqual({ showBubbleControls: false, showBackgroundControls: true, showChatGlowControls: true });
    expect(getAppearancePanelVisibility("/chat", false)).toEqual({ showBubbleControls: false, showBackgroundControls: false, showChatGlowControls: true });
    expect(getAppearancePanelVisibility("/login", true)).toEqual({ showBubbleControls: false, showBackgroundControls: false, showChatGlowControls: false });
    expect(getAppearancePanelVisibility("/settings", true)).toEqual({ showBubbleControls: false, showBackgroundControls: false, showChatGlowControls: false });
  });
});

describe("chat entry transition", () => {
  it("only intercepts an unmodified primary click", () => {
    expect(isPlainPrimaryClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toBe(true);
    expect(isPlainPrimaryClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toBe(false);
    expect(isPlainPrimaryClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe(false);
  });

  it("accepts only short-lived chat entry markers", () => {
    const now = 1_000_000;
    expect(isPendingChatEntry(createChatEntryToken(now), now + CHAT_ENTRY_TOKEN_TTL_MS)).toBe(true);
    expect(isPendingChatEntry(createChatEntryToken(now), now + CHAT_ENTRY_TOKEN_TTL_MS + 1)).toBe(false);
    expect(isPendingChatEntry("invalid", now)).toBe(false);
  });
});
