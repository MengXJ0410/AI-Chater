export const APPEARANCE_STORAGE_KEY = "ai-chater-appearance-v1";
export const APPEARANCE_CHANGE_EVENT = "ai-chater:appearance-change";
export const CHAT_BACKGROUND_STORAGE_KEY = "ai-chater-chat-background-v1";
export const CHAT_BACKGROUND_CHANGE_EVENT = "ai-chater:chat-background-change";
export const DEFAULT_ACCENT = "#1fbbbb";
export const ACCENT_SWATCHES = ["#1fbbbb", "#2f63c8", "#9f3f68", "#c25d22", "#7057b8"];

export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedAppearanceMode = Exclude<AppearanceMode, "system">;

export type AppearancePreferences = {
  colorMode: AppearanceMode;
  accent: string;
  background: string | null;
  surfaceOpacity: number;
  backgroundBlur: number;
  bubbleColorRange: number;
  bubbleActivity: number;
  chatGlowBrightness: number;
  chatGlowMotion: number;
  chatFontSize: number;
};

export type DerivedAccentTheme = {
  accent: string;
  strong: string;
  soft: string;
  muted: string;
  border: string;
  action: string;
  actionAlt: string;
  actionText: string;
};

export type AppearanceChangeDetail = { accent: string; bubbleColorRange: number; bubbleActivity: number; colorMode: ResolvedAppearanceMode };
export type ChatBackgroundChangeDetail = { enabled: boolean };
export type AppearancePanelVisibility = { showBubbleControls: boolean; showBackgroundControls: boolean; showChatGlowControls: boolean };
export type BubbleColorFactors = { redFactor: number; greenFactor: number; blueFactor: number };
export type DerivedBubbleColor = { primary: string; secondary: string; text: string };

export const defaultAppearance: AppearancePreferences = {
  colorMode: "system",
  accent: DEFAULT_ACCENT,
  background: null,
  surfaceOpacity: 86,
  backgroundBlur: 0,
  bubbleColorRange: 60,
  bubbleActivity: 70,
  chatGlowBrightness: 85,
  chatGlowMotion: 100,
  chatFontSize: 2,
};

export function getAppearancePanelVisibility(pathname: string, chatBackgroundEnabled: boolean): AppearancePanelVisibility {
  if (pathname === "/") return { showBubbleControls: true, showBackgroundControls: true, showChatGlowControls: false };
  if (pathname === "/chat") return { showBubbleControls: false, showBackgroundControls: chatBackgroundEnabled, showChatGlowControls: true };
  return { showBubbleControls: false, showBackgroundControls: false, showChatGlowControls: false };
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveAppearanceMode(mode: AppearanceMode, systemPrefersDark: boolean): ResolvedAppearanceMode {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

export function getBackgroundStrength(surfaceOpacity: number) {
  return Math.min(1, Math.max(0, surfaceOpacity / 100));
}

const CHAT_FONT_SCALES = [0.4, 0.8, 1, 1.2, 1.6] as const;
const CHAT_FONT_LABELS = ["极小", "小", "默认", "大", "极大"] as const;

export function getChatFontScale(size: number) {
  return CHAT_FONT_SCALES[Math.min(4, Math.max(0, Math.round(size)))] ?? 1;
}

export function getChatFontLabel(size: number) {
  return CHAT_FONT_LABELS[Math.min(4, Math.max(0, Math.round(size)))] ?? "默认";
}

export function darkerColor(hex: string) {
  const channels = [1, 3, 5].map((offset) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * 0.72));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

type Rgb = { r: number; g: number; b: number };

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function hexToRgb(hex: string): Rgb {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

function shift(rgb: Rgb, red: number, green: number, blue: number): Rgb {
  return { r: clampChannel(rgb.r + red), g: clampChannel(rgb.g + green), b: clampChannel(rgb.b + blue) };
}

function mix(first: Rgb, second: Rgb, secondWeight: number): Rgb {
  return {
    r: first.r * (1 - secondWeight) + second.r * secondWeight,
    g: first.g * (1 - secondWeight) + second.g * secondWeight,
    b: first.b * (1 - secondWeight) + second.b * secondWeight,
  };
}

function relativeLuminance(rgb: Rgb) {
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: Rgb, second: Rgb) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function readableText(background: Rgb) {
  const light = { r: 255, g: 255, b: 255 };
  const dark = { r: 18, g: 28, b: 25 };
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? "#ffffff" : "#121c19";
}

export function deriveAccentTheme(hex: string, colorMode: ResolvedAppearanceMode = "light"): DerivedAccentTheme {
  const accent = hexToRgb(isHexColor(hex) ? hex : DEFAULT_ACCENT);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const darkSurface = { r: 15, g: 24, b: 36 };
  const darkBorder = { r: 42, g: 57, b: 75 };
  const actionText = readableText(accent);
  const actionTarget = actionText === "#ffffff" ? black : white;
  const action = contrastRatio(accent, hexToRgb(actionText)) >= 4.5 ? accent : mix(accent, actionTarget, 0.18);

  return {
    accent: rgbToHex(accent),
    strong: rgbToHex(mix(accent, black, 0.26)),
    soft: rgbToHex(mix(colorMode === "dark" ? darkSurface : white, accent, colorMode === "dark" ? 0.14 : 0.08)),
    muted: rgbToHex(mix(colorMode === "dark" ? darkSurface : white, accent, colorMode === "dark" ? 0.25 : 0.16)),
    border: rgbToHex(mix(colorMode === "dark" ? darkBorder : white, accent, colorMode === "dark" ? 0.44 : 0.32)),
    action: rgbToHex(action),
    actionAlt: rgbToHex(shift(action, actionText === "#ffffff" ? 7 : -7, actionText === "#ffffff" ? 4 : -4, actionText === "#ffffff" ? 6 : -6)),
    actionText,
  };
}

export function deriveBubbleColor(hex: string, factors: BubbleColorFactors, range = defaultAppearance.bubbleColorRange): DerivedBubbleColor {
  const accent = hexToRgb(isHexColor(hex) ? hex : DEFAULT_ACCENT);
  const redOffset = Math.round(factors.redFactor * range);
  const greenOffset = Math.round(factors.greenFactor * range);
  const blueOffset = Math.round(factors.blueFactor * range);
  const primary = shift(accent, redOffset, greenOffset, blueOffset);
  const secondary = shift(
    primary,
    redOffset >= 0 ? -6 : 6,
    greenOffset >= 0 ? 5 : -5,
    blueOffset >= 0 ? -7 : 7,
  );
  return { primary: rgbToHex(primary), secondary: rgbToHex(secondary), text: readableText(primary) };
}

function numberInRange(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

export function parseAppearance(value: string | null): AppearancePreferences {
  if (!value) return defaultAppearance;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== "object") return defaultAppearance;
    const record = candidate as Record<string, unknown>;
    return {
      colorMode: isAppearanceMode(record.colorMode) ? record.colorMode : "system",
      accent: isHexColor(record.accent) ? record.accent : DEFAULT_ACCENT,
      background: typeof record.background === "string" && /^data:image\/(webp|png|jpeg);base64,/i.test(record.background)
        ? record.background
        : null,
      surfaceOpacity: numberInRange(record.surfaceOpacity, defaultAppearance.surfaceOpacity, 20, 100),
      backgroundBlur: numberInRange(record.backgroundBlur, defaultAppearance.backgroundBlur, 0, 24),
      bubbleColorRange: numberInRange(record.bubbleColorRange, defaultAppearance.bubbleColorRange, 0, 100),
      bubbleActivity: numberInRange(record.bubbleActivity, defaultAppearance.bubbleActivity, 0, 200),
      chatGlowBrightness: numberInRange(record.chatGlowBrightness, defaultAppearance.chatGlowBrightness, 0, 200),
      chatGlowMotion: numberInRange(record.chatGlowMotion, defaultAppearance.chatGlowMotion, 0, 200),
      chatFontSize: numberInRange(record.chatFontSize, defaultAppearance.chatFontSize, 0, 4),
    };
  } catch {
    return defaultAppearance;
  }
}
