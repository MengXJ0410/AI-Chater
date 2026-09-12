import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { getAiPresets, type AiPreset } from "@/server/config";
import type { AiProvider } from "@/shared/config";
import { readImage } from "@/server/services/uploads";
import type { MessagePart } from "@/shared/messages";
import { assertSafeResolvedRequestUrl } from "@/server/services/user-ai-config";

export function getPreset(id: string) {
  return getAiPresets().find((preset) => preset.id === id);
}

export type ModelConnection = {
  provider: AiProvider;
  baseUrl?: string;
  model: string;
  apiKey: string;
};

type ProviderAdapter = {
  create: (connection: ModelConnection) => LanguageModel;
};

const guardedFetch: typeof fetch = async (input, init) => {
  const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  await assertSafeResolvedRequestUrl(requestUrl);
  return fetch(input, { ...init, redirect: "error" });
};

function apiKeyFor(preset: AiPreset) {
  const key = process.env[preset.apiKeyEnv];
  if (!key) throw new Error(`未配置 ${preset.label} 所需的 API Key。`);
  return key;
}

export function connectionFromPreset(preset: AiPreset): ModelConnection {
  return { provider: preset.provider, baseUrl: preset.baseUrl, model: preset.model, apiKey: apiKeyFor(preset) };
}

const providerAdapters: Record<AiProvider, ProviderAdapter> = {
  openai: {
    create: (connection) => createOpenAI({ apiKey: connection.apiKey, baseURL: connection.baseUrl, fetch: guardedFetch })(connection.model),
  },
  "openai-compatible": {
    create: (connection) => {
      if (!connection.baseUrl) throw new Error("OpenAI-compatible 预设需要配置 baseUrl。");
      return createOpenAICompatible({ name: "configured-compatible", apiKey: connection.apiKey, baseURL: connection.baseUrl, fetch: guardedFetch })(connection.model);
    },
  },
  xai: {
    create: (connection) => createXai({ apiKey: connection.apiKey, baseURL: connection.baseUrl, fetch: guardedFetch })(connection.model),
  },
  anthropic: {
    create: (connection) => createAnthropic({ apiKey: connection.apiKey, baseURL: connection.baseUrl, fetch: guardedFetch })(connection.model),
  },
  google: {
    create: (connection) => createGoogle({ apiKey: connection.apiKey, baseURL: connection.baseUrl, fetch: guardedFetch })(connection.model),
  },
};

export function getLanguageModel(connection: ModelConnection): LanguageModel {
  return providerAdapters[connection.provider].create(connection);
}

export function logModelError(error: unknown) {
  if (error instanceof Error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : undefined;
    console.error("AI model request failed", { name: error.name, statusCode });
    return;
  }
  console.error("AI model request failed", { type: typeof error });
}

export function modelStreamErrorHandler(error: unknown): void {
  logModelError(error);
}

export async function testModelConnection(connection: ModelConnection, abortSignal: AbortSignal) {
  await generateText({
    model: getLanguageModel(connection),
    messages: [{ role: "user", content: "Reply with OK only." }],
    maxOutputTokens: 1,
    abortSignal,
  });
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
