import { requestJson } from "@/client/api/http";

export type AiPreset = { id: string; label: string; model: string; supportsImages: boolean };

export async function getChatPresets(): Promise<AiPreset[]> {
  const data = await requestJson<{ presets: AiPreset[] }>("/api/ai/presets", undefined, "读取模型预设失败。");
  return data.presets;
}

export async function getImagePresets(): Promise<Record<string, unknown>[]> {
  const data = await requestJson<{ presets: Record<string, unknown>[] }>("/api/ai/image-presets", undefined, "生图模型加载失败。请等待后端接口接入。");
  return data.presets;
}
