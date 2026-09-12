import { normalizeSpiderTuning, type SpiderTuning } from "./spider";

export const SPIDER_PRESET_STORAGE_KEY = "ai-chater-spider-presets-v1";

export type SpiderPreset = {
  id: string;
  name: string;
  tuning: SpiderTuning;
};

export function createSpiderPreset(name: string, tuning: SpiderTuning): SpiderPreset {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "未命名预设",
    tuning: normalizeSpiderTuning(tuning),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSpiderPresets(value: string | null): SpiderPreset[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const presets: SpiderPreset[] = [];
    for (const entry of parsed) {
      if (!isRecord(entry)) continue;
      const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : "未命名预设";
      const id = typeof entry.id === "string" ? entry.id : `${presets.length}`;
      presets.push({ id, name, tuning: normalizeSpiderTuning(entry.tuning) });
    }
    return presets;
  } catch {
    return [];
  }
}

export function saveSpiderPresets(presets: SpiderPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPIDER_PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // 存储不可用时忽略
  }
}
