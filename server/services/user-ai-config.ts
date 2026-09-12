import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getUserAiConnectionPresets, USER_AI_PRESET_ID, type AiProvider, type UserAiConnectionPreset } from "@/shared/config";
import type { PublicAiPreset } from "@/server/config";
import { getDb } from "@/server/db";
import { userAiConfigs } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";
import { decryptApiKey, encryptApiKey, getActiveEncryptionKeyId } from "@/server/security/api-key-crypto";
import { assertPublicCompatibleBaseUrl, normalizeBaseUrl } from "@/server/security/url-safety";

export { USER_AI_PRESET_ID };
export const CUSTOM_USER_AI_PRESET_ID = "custom";

const OFFICIAL_BASE_URLS: Record<Exclude<AiProvider, "openai-compatible">, string> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
};

export type UserAiConfigInput = {
  presetId: string;
  name?: string;
  provider?: AiProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
};

type LegacyUserAiConfigInput = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type PublicUserAiConfig = {
  presetId?: string;
  name?: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKeyConfigured: true;
  apiKeyLast4: string;
};

export type UserAiModelConfig = {
  provider: AiProvider;
  baseUrl?: string;
  model: string;
  apiKey: string;
};

export type PublicUserAiConnectionPreset = UserAiConnectionPreset & { readOnly?: boolean };

const LEGACY_PRESET_ID = "legacy-custom";

function getConnectionPreset(presetId: string) {
  return getUserAiConnectionPresets().find((preset) => preset.id === presetId);
}

function canonicalBaseUrl(provider: AiProvider, baseUrl: string | null | undefined) {
  return baseUrl || (provider === "openai" ? OFFICIAL_BASE_URLS.openai : provider === "xai" ? OFFICIAL_BASE_URLS.xai : provider === "anthropic" ? OFFICIAL_BASE_URLS.anthropic : provider === "google" ? OFFICIAL_BASE_URLS.google : "");
}

function matchingConnectionPreset(row: Pick<typeof userAiConfigs.$inferSelect, "provider" | "baseUrl" | "model">) {
  const baseUrl = canonicalBaseUrl(row.provider, row.baseUrl);
  return getUserAiConnectionPresets().find((preset) => preset.provider === row.provider && preset.baseUrl === baseUrl && preset.model === row.model);
}

export function getPublicUserAiConnectionPresets(config?: PublicUserAiConfig | null): PublicUserAiConnectionPreset[] {
  const presets: PublicUserAiConnectionPreset[] = getUserAiConnectionPresets();
  presets.push({ id: CUSTOM_USER_AI_PRESET_ID, label: config?.presetId === CUSTOM_USER_AI_PRESET_ID && config.name ? config.name : "自定义预设", provider: "openai-compatible", baseUrl: "", model: "" });
  if (config && config.presetId === LEGACY_PRESET_ID) {
    presets.push({ id: LEGACY_PRESET_ID, label: "已有自定义配置", provider: config.provider, baseUrl: config.baseUrl, model: config.model, readOnly: true });
  }
  return presets;
}

export function getUserAiConnectionPresetById(presetId: string) {
  return getConnectionPreset(presetId);
}

export function validateUserAiConfig(input: { provider: AiProvider; baseUrl: string; model: string }, options?: { allowUnlistedCompatibleUrl?: boolean }) {
  const baseUrl = input.baseUrl ? normalizeBaseUrl(input.baseUrl, input.provider) : undefined;
  if (input.provider === "openai-compatible") {
    if (!baseUrl) throw new RequestError("OpenAI Compatible Provider 必须填写 Base URL。");
    if (options?.allowUnlistedCompatibleUrl) {
      assertPublicCompatibleBaseUrl(baseUrl);
    }
    const allowlist = process.env.USER_AI_ALLOWED_BASE_URLS;
    if (allowlist && !options?.allowUnlistedCompatibleUrl) {
      const allowed = parseAllowedBaseUrls(allowlist, input.provider);
      if (!allowed.has(baseUrl)) throw new RequestError("该 Base URL 未获管理员授权。", 403);
    }
  } else if (baseUrl && baseUrl !== OFFICIAL_BASE_URLS[input.provider]) {
    throw new RequestError("该 Provider 只允许使用官方 Base URL。", 403);
  }

  return { provider: input.provider, baseUrl, model: input.model };
}

function parseAllowedBaseUrls(raw: string, provider: AiProvider) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 JSON 数组。");
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 URL 字符串数组。");
  return new Set(parsed.map((value) => normalizeBaseUrl(value, provider)));
}

function validateConnectionPreset(preset: UserAiConnectionPreset) {
  const baseUrl = normalizeBaseUrl(preset.baseUrl, preset.provider);
  if (preset.provider === "openai-compatible") {
    const allowlist = process.env.USER_AI_ALLOWED_BASE_URLS;
    if (allowlist) {
      const allowed = parseAllowedBaseUrls(allowlist, preset.provider);
      if (!allowed.has(baseUrl)) throw new RequestError("该连接方案未获管理员授权。", 403);
    }
  }
  return validateUserAiConfig(preset);
}

function toPublicConfig(row: typeof userAiConfigs.$inferSelect): PublicUserAiConfig {
  const storedPreset = row.connectionPresetId === CUSTOM_USER_AI_PRESET_ID
    ? CUSTOM_USER_AI_PRESET_ID
    : getConnectionPreset(row.connectionPresetId ?? "")?.id;
  return {
    presetId: storedPreset ?? matchingConnectionPreset(row)?.id ?? LEGACY_PRESET_ID,
    name: row.name ?? undefined,
    provider: row.provider,
    baseUrl: canonicalBaseUrl(row.provider, row.baseUrl),
    model: row.model,
    apiKeyConfigured: true,
    apiKeyLast4: row.apiKeyLast4,
  };
}

function toPublicConfigValues(values: Pick<PublicUserAiConfig, "presetId" | "name" | "provider" | "baseUrl" | "model" | "apiKeyLast4">): PublicUserAiConfig {
  return { ...values, apiKeyConfigured: true };
}

export function toUserAiPreset(config: PublicUserAiConfig): PublicAiPreset {
  return { id: USER_AI_PRESET_ID, label: config.name || "我的配置", model: config.model, supportsImages: false };
}

export async function getPublicUserAiConfig(userId: string) {
  const rows = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).orderBy(desc(userAiConfigs.updatedAt)).limit(1);
  return rows[0] ? toPublicConfig(rows[0]) : null;
}

export function resolveUserAiInput(input: UserAiConfigInput | LegacyUserAiConfigInput) {
  if ("presetId" in input) {
    if (input.presetId === CUSTOM_USER_AI_PRESET_ID) {
      if (!input.provider || !input.baseUrl || !input.model) throw new RequestError("自定义预设需要填写 Provider、Base URL 和 Model。");
      const normalized = validateUserAiConfig({ provider: input.provider, baseUrl: input.baseUrl, model: input.model }, { allowUnlistedCompatibleUrl: true });
      return { ...normalized, presetId: CUSTOM_USER_AI_PRESET_ID, name: input.name, apiKey: input.apiKey };
    }
    const preset = getConnectionPreset(input.presetId);
    if (!preset) throw new RequestError("连接方案不存在。", 400);
    const normalized = validateConnectionPreset(preset);
    return { ...normalized, presetId: preset.id, name: undefined, apiKey: input.apiKey };
  }
  const normalized = validateUserAiConfig(input);
  return { ...normalized, presetId: matchingConnectionPreset(input)?.id ?? LEGACY_PRESET_ID, name: undefined, apiKey: input.apiKey };
}

export async function resolveUserAiModelConfig(userId: string, input: UserAiConfigInput) {
  const resolved = resolveUserAiInput(input);
  const { apiKey, provider, baseUrl, model } = resolved;
  const existing = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).orderBy(desc(userAiConfigs.updatedAt)).limit(1);
  if (!apiKey && !existing[0]) throw new RequestError("首次测试必须填写 API Key。");
  const resolvedApiKey = apiKey ?? decryptApiKey(existing[0]!);
  return { provider, baseUrl, model, apiKey: resolvedApiKey } satisfies UserAiModelConfig;
}

export async function saveUserAiConfig(userId: string, input: UserAiConfigInput | LegacyUserAiConfigInput) {
  const resolved = resolveUserAiInput(input);
  const { apiKey, presetId, name, provider, baseUrl, model } = resolved;
  const normalized = { provider, baseUrl, model };
  const existing = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).orderBy(desc(userAiConfigs.updatedAt)).limit(1);
  if (!apiKey && !existing[0]) throw new RequestError("首次保存必须填写 API Key。");

  let encrypted = apiKey ? encryptApiKey(apiKey) : existing[0]!;
  if (!apiKey && existing[0] && existing[0].encryptionKeyId !== getActiveEncryptionKeyId()) {
    encrypted = encryptApiKey(decryptApiKey(existing[0]));
  }
  const values = {
    connectionPresetId: presetId,
    name: name ?? existing[0]?.name ?? "我的对话配置",
    ...normalized,
    apiKeyCiphertext: encrypted.apiKeyCiphertext,
    apiKeyIv: encrypted.apiKeyIv,
    apiKeyAuthTag: encrypted.apiKeyAuthTag,
    encryptionKeyId: encrypted.encryptionKeyId,
    apiKeyLast4: apiKey ? apiKey.slice(-4) : existing[0]!.apiKeyLast4,
  };
  if (existing[0]) {
    await getDb().update(userAiConfigs).set(values).where(eq(userAiConfigs.id, existing[0].id));
    return toPublicConfigValues({ presetId, name: values.name ?? undefined, ...normalized, baseUrl: normalized.baseUrl ?? "", apiKeyLast4: values.apiKeyLast4 });
  }

  await getDb().insert(userAiConfigs).values({ id: randomUUID(), userId, ...values });
  return toPublicConfigValues({ presetId, name: values.name ?? undefined, ...normalized, baseUrl: normalized.baseUrl ?? "", apiKeyLast4: values.apiKeyLast4 });
}

export async function deleteUserAiConfig(userId: string) {
  const existing = await getDb().select({ id: userAiConfigs.id }).from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).orderBy(desc(userAiConfigs.updatedAt)).limit(1);
  if (existing[0]) await getDb().delete(userAiConfigs).where(eq(userAiConfigs.id, existing[0].id));
}

export async function getUserAiModelConfig(userId: string): Promise<UserAiModelConfig | null> {
  const rows = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).orderBy(desc(userAiConfigs.updatedAt)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const config = validateUserAiConfig(
    { provider: row.provider, baseUrl: row.baseUrl ?? "", model: row.model },
    { allowUnlistedCompatibleUrl: row.connectionPresetId === CUSTOM_USER_AI_PRESET_ID },
  );
  const apiKey = decryptApiKey(row);
  if (row.encryptionKeyId !== getActiveEncryptionKeyId()) {
    const reencrypted = encryptApiKey(apiKey);
    await getDb().update(userAiConfigs).set(reencrypted).where(eq(userAiConfigs.id, row.id));
  }
  return { ...config, apiKey };
}
