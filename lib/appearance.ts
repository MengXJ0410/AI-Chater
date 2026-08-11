export const APPEARANCE_STORAGE_KEY = "ai-chater-appearance-v1";
export const DEFAULT_ACCENT = "#12634f";
export const ACCENT_SWATCHES = ["#12634f", "#2f63c8", "#9f3f68", "#c25d22", "#7057b8"];

export type AppearancePreferences = {
  accent: string;
  background: string | null;
  surfaceOpacity: number;
  backgroundBlur: number;
};

export const defaultAppearance: AppearancePreferences = {
  accent: DEFAULT_ACCENT,
  background: null,
  surfaceOpacity: 86,
  backgroundBlur: 0,
};

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function darkerColor(hex: string) {
  const channels = [1, 3, 5].map((offset) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * 0.72));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
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
      accent: isHexColor(record.accent) ? record.accent : DEFAULT_ACCENT,
      background: typeof record.background === "string" && /^data:image\/(webp|png|jpeg);base64,/i.test(record.background)
        ? record.background
        : null,
      surfaceOpacity: numberInRange(record.surfaceOpacity, defaultAppearance.surfaceOpacity, 20, 100),
      backgroundBlur: numberInRange(record.backgroundBlur, defaultAppearance.backgroundBlur, 0, 24),
    };
  } catch {
    return defaultAppearance;
  }
}
