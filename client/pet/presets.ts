import { normalizeSpiderTuning, type SpiderTuning } from "./spider";

export const SPIDER_PRESET_STORAGE_KEY = "ai-chater-spider-presets-v1";
export const SPIDER_PRESET_FILE_NAME = "spider-presets.json";
export const SPIDER_PRESET_FILE_TYPE = "ai-chater-spider-presets";

export type SpiderPreset = {
  id: string;
  name: string;
  tuning: SpiderTuning;
};

export type SpiderPresetFile = {
  type: typeof SPIDER_PRESET_FILE_TYPE;
  version: number;
  presets: SpiderPreset[];
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

function presetList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.presets)) return value.presets;
  return [];
}

export function parseSpiderPresets(value: string | null): SpiderPreset[] {
  if (!value) return [];
  try {
    return parseSpiderPresetValue(JSON.parse(value));
  } catch {
    return [];
  }
}

/** 解析任意来源（localStorage、导入文件、对象）的预设，非法项跳过。 */
export function parseSpiderPresetValue(value: unknown): SpiderPreset[] {
  const presets: SpiderPreset[] = [];
  for (const entry of presetList(value)) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : "未命名预设";
    const id = typeof entry.id === "string" ? entry.id : `${presets.length}`;
    presets.push({ id, name, tuning: normalizeSpiderTuning(entry.tuning) });
  }
  return presets;
}

/** 序列化为可保存/分享的 JSON 文本（带类型与版本信息）。 */
export function serializeSpiderPresets(presets: SpiderPreset[]): string {
  const file: SpiderPresetFile = {
    type: SPIDER_PRESET_FILE_TYPE,
    version: 1,
    presets: presets.map((preset) => ({ ...preset, tuning: normalizeSpiderTuning(preset.tuning) })),
  };
  return JSON.stringify(file, null, 2);
}

/** 把导入的预设并入现有列表，按 id 去重。 */
export function mergeSpiderPresets(existing: SpiderPreset[], incoming: SpiderPreset[]): SpiderPreset[] {
  const seen = new Set(existing.map((preset) => preset.id));
  const merged = [...existing];
  for (const preset of incoming) {
    let id = preset.id;
    while (seen.has(id)) id = `${preset.id}-${Math.random().toString(36).slice(2, 6)}`;
    seen.add(id);
    merged.push(id === preset.id ? preset : { ...preset, id });
  }
  return merged;
}

export function saveSpiderPresets(presets: SpiderPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPIDER_PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // 存储不可用时忽略
  }
}
