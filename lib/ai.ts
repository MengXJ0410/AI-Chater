import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel, ModelMessage } from "ai";
import { getAiPresets, type AiPreset } from "@/lib/config";
import { readImage } from "@/lib/uploads";
import type { MessagePart } from "@/lib/messages";

export function getPreset(id: string) {
  return getAiPresets().find((preset) => preset.id === id);
}

function apiKeyFor(preset: AiPreset) {
  const key = process.env[preset.apiKeyEnv];
  if (!key) throw new Error(`未配置 ${preset.label} 所需的 API Key。`);
  return key;
}

export function getLanguageModel(preset: AiPreset): LanguageModel {
  const apiKey = apiKeyFor(preset);
  switch (preset.provider) {
    case "openai":
      return createOpenAI({ apiKey, baseURL: preset.baseUrl })(preset.model);
    case "openai-compatible":
      if (!preset.baseUrl) throw new Error("OpenAI-compatible 预设需要配置 baseUrl。");
      return createOpenAICompatible({ name: "configured-compatible", apiKey, baseURL: preset.baseUrl })(preset.model);
    case "xai":
      return createXai({ apiKey, baseURL: preset.baseUrl })(preset.model);
    case "anthropic":
      return createAnthropic({ apiKey, baseURL: preset.baseUrl })(preset.model);
    case "google":
      return createGoogle({ apiKey, baseURL: preset.baseUrl })(preset.model);
  }
}

export async function toModelMessages(rows: Array<{ role: "user" | "assistant"; parts: MessagePart[]; mimeTypes?: Map<string, string>; storageKeys?: Map<string, string> }>): Promise<ModelMessage[]> {
  return Promise.all(rows.map(async (row) => {
    if (row.role === "assistant") {
      return { role: "assistant", content: row.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n") };
    }

    const content = await Promise.all(row.parts.map(async (part) => {
      if (part.type === "text") return { type: "text" as const, text: part.text };
      const storageKey = row.storageKeys?.get(part.attachmentId);
      const mimeType = row.mimeTypes?.get(part.attachmentId);
      if (!storageKey || !mimeType) throw new Error("找不到图片附件。");
      return { type: "file" as const, mediaType: mimeType, data: await readImage(storageKey) };
    }));
    return { role: "user", content };
  }));
}
