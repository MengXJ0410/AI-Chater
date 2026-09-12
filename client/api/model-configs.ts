import { jsonInit, requestJson, requestJsonStatus, requestVoid } from "@/client/api/http";
import type { SavedWorkspaceConfig } from "@/client/workspace-configs";

export type ConnectionPreset = { id: string; label: string; provider: string; baseUrl: string; model: string; readOnly?: boolean };
export type SavedAiConfig = ConnectionPreset & { presetId: string; name?: string; apiKeyConfigured: boolean; apiKeyLast4: string };
export type SavedImageConfig = {
  name: string;
  provider: "xai-compatible" | "openai-compatible";
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
};
export type SavedConfigEntity = SavedAiConfig | SavedImageConfig | SavedWorkspaceConfig;

export type LegacyChatConfig = { config: SavedAiConfig | null; presets: ConnectionPreset[] };

export async function listSavedModelConfigs(): Promise<{ ok: boolean; status: number; configs: unknown[] }> {
  const { ok, status, data } = await requestJsonStatus<{ configs: unknown[] }>("/api/me/model-configs");
  return { ok, status, configs: Array.isArray(data.configs) ? data.configs : [] };
}

export async function getLegacyChatConfig(): Promise<LegacyChatConfig> {
  return requestJson<LegacyChatConfig>("/api/me/ai-config", undefined, "读取对话配置失败。");
}

export async function getLegacyImageConfig(): Promise<{ config: SavedImageConfig | null }> {
  return requestJson<{ config: SavedImageConfig | null }>("/api/me/image-config", undefined, "读取生图配置失败。");
}

export async function createModelConfig(payload: unknown): Promise<{ config: SavedConfigEntity }> {
  return requestJson<{ config: SavedConfigEntity }>("/api/me/model-configs", jsonInit(payload), "保存配置失败。");
}

export async function updateModelConfig(id: string, payload: unknown): Promise<{ config: SavedConfigEntity }> {
  return requestJson<{ config: SavedConfigEntity }>(`/api/me/model-configs/${id}`, jsonInit(payload, "PUT"), "保存配置失败。");
}

export async function deleteModelConfig(id: string): Promise<void> {
  await requestVoid(`/api/me/model-configs/${id}`, { method: "DELETE" }, "删除配置失败。");
}

export async function testModelConfig(id: string): Promise<{ model?: string }> {
  return requestJson<{ model?: string }>(`/api/me/model-configs/${id}/test`, { method: "POST" }, "连接测试失败，请检查配置。");
}

export async function saveLegacyChatConfig(payload: unknown): Promise<{ config: SavedAiConfig }> {
  return requestJson<{ config: SavedAiConfig }>("/api/me/ai-config", jsonInit(payload, "PUT"), "保存配置失败。");
}

export async function deleteLegacyChatConfig(): Promise<void> {
  await requestVoid("/api/me/ai-config", { method: "DELETE" }, "清空配置失败。");
}

export async function testLegacyChatConfig(payload: unknown): Promise<{ model: string }> {
  return requestJson<{ model: string }>("/api/me/ai-config/test", jsonInit(payload), "连接测试失败，请检查 API Key、Base URL 和 Model。");
}

export async function saveLegacyImageConfig(payload: unknown): Promise<{ config: SavedImageConfig }> {
  return requestJson<{ config: SavedImageConfig }>("/api/me/image-config", jsonInit(payload, "PUT"), "生图配置服务尚未接入。");
}

export async function deleteLegacyImageConfig(): Promise<void> {
  await requestVoid("/api/me/image-config", { method: "DELETE" }, "生图配置服务尚未接入。");
}

export async function testLegacyImageConfig(payload: unknown): Promise<void> {
  await requestJson("/api/me/image-config/test", jsonInit(payload), "生图配置服务尚未接入。");
}
