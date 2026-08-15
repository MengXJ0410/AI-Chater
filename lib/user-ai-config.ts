import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { eq } from "drizzle-orm";
import { getUserAiConnectionPresets, USER_AI_PRESET_ID, type AiProvider, type PublicAiPreset, type UserAiConnectionPreset } from "@/lib/config";
import { getDb } from "@/lib/db";
import { userAiConfigs } from "@/lib/db/schema";
import { RequestError } from "@/lib/http";

export { USER_AI_PRESET_ID };
export const CUSTOM_USER_AI_PRESET_ID = "custom";

const OFFICIAL_BASE_URLS: Record<Exclude<AiProvider, "openai-compatible">, string> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
};

type EncryptionKeyring = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
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

function decodeEncryptionKey(value: string, label: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error(`${label} 必须是 32 字节 Base64 密钥。`);
  return key;
}

function getEncryptionKeyring(): EncryptionKeyring {
  const singleKey = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (singleKey) return { activeKeyId: "default", keys: new Map([["default", decodeEncryptionKey(singleKey, "AI_CONFIG_ENCRYPTION_KEY")]]) };

  const raw = process.env.AI_CONFIG_ENCRYPTION_KEYS;
  const activeKeyId = process.env.AI_CONFIG_ACTIVE_KEY_ID;
  if (!raw || !activeKeyId) throw new Error("未配置 AI_CONFIG_ENCRYPTION_KEY。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI_CONFIG_ENCRYPTION_KEYS 必须是 JSON 对象。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI_CONFIG_ENCRYPTION_KEYS 必须是 JSON 对象。");
  const keys = new Map<string, Buffer>();
  for (const [keyId, value] of Object.entries(parsed)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId) || typeof value !== "string") throw new Error("AI_CONFIG_ENCRYPTION_KEYS 包含无效 key id 或值。");
    keys.set(keyId, decodeEncryptionKey(value, `AI_CONFIG_ENCRYPTION_KEYS.${keyId}`));
  }
  if (!keys.has(activeKeyId)) throw new Error("AI_CONFIG_ACTIVE_KEY_ID 未在密钥环中定义。");
  return { activeKeyId, keys };
}

export function getActiveEncryptionKeyId() {
  return getEncryptionKeyring().activeKeyId;
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isPrivateIp(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const version = isIP(normalized);
  if (version === 4) {
    const octets = normalized.split(".").map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
  }
  if (version === 6) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:");
  }
  return false;
}

function isInternalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized.endsWith(".internal");
}

export function assertSafeRequestUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestError("模型请求地址无效。", 502);
  }
  const loopback = isLoopbackHost(url.hostname);
  if (url.username || url.password || (isPrivateIp(url.hostname) && !loopback)) {
    throw new RequestError("模型请求地址指向不允许的内网地址。", 502);
  }
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new RequestError("模型请求地址必须使用 HTTPS。", 502);
  }
  if (!loopback && isInternalHostname(url.hostname)) {
    throw new RequestError("模型请求地址使用了不允许的内部主机名。", 502);
  }
}

export async function assertSafeResolvedRequestUrl(value: string) {
  assertSafeRequestUrl(value);
  const url = new URL(value);
  if (isIP(url.hostname) || isLoopbackHost(url.hostname)) return;
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some(({ address }) => isPrivateIp(address))) {
    throw new RequestError("模型请求地址解析到了不允许的内网地址。", 502);
  }
}

export function normalizeBaseUrl(value: string, provider: AiProvider = "openai-compatible") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestError("Base URL 格式无效。");
  }
  const loopback = isLoopbackHost(url.hostname);
  if (url.username || url.password || url.search || url.hash || (isPrivateIp(url.hostname) && !loopback)) {
    throw new RequestError("Base URL 不能包含账号、查询参数、片段或内网地址。");
  }
  if (url.protocol !== "https:" && !(provider === "openai-compatible" && loopback && url.protocol === "http:")) {
    throw new RequestError("Base URL 必须使用 HTTPS；本地兼容模型可使用 HTTP loopback 地址。");
  }
  if (loopback && provider !== "openai-compatible") {
    throw new RequestError("只有 OpenAI Compatible Provider 可以连接本机地址。", 403);
  }
  if (!loopback && isInternalHostname(url.hostname)) {
    throw new RequestError("Base URL 不允许使用内部主机名。", 403);
  }
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${pathname}`;
}

export function validateUserAiConfig(input: { provider: AiProvider; baseUrl: string; model: string }, options?: { allowUnlistedCompatibleUrl?: boolean }) {
  const baseUrl = input.baseUrl ? normalizeBaseUrl(input.baseUrl, input.provider) : undefined;
  if (input.provider === "openai-compatible") {
    if (!baseUrl) throw new RequestError("OpenAI Compatible Provider 必须填写 Base URL。");
    if (options?.allowUnlistedCompatibleUrl) {
      const customUrl = new URL(baseUrl);
      if (customUrl.protocol !== "https:" || isIP(customUrl.hostname) || isLoopbackHost(customUrl.hostname)) {
        throw new RequestError("自定义 Base URL 必须是 HTTPS 公网域名。", 403);
      }
    }
    const allowlist = process.env.USER_AI_ALLOWED_BASE_URLS;
    if (allowlist && !options?.allowUnlistedCompatibleUrl) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(allowlist);
      } catch {
        throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 JSON 数组。");
      }
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 URL 字符串数组。");
      const allowed = new Set(parsed.map((value) => normalizeBaseUrl(value, input.provider)));
      if (!allowed.has(baseUrl)) throw new RequestError("该 Base URL 未获管理员授权。", 403);
    }
  } else if (baseUrl && baseUrl !== OFFICIAL_BASE_URLS[input.provider]) {
    throw new RequestError("该 Provider 只允许使用官方 Base URL。", 403);
  }

  return { provider: input.provider, baseUrl, model: input.model };
}

function validateConnectionPreset(preset: UserAiConnectionPreset) {
  const baseUrl = normalizeBaseUrl(preset.baseUrl, preset.provider);
  if (preset.provider === "openai-compatible") {
    const allowlist = process.env.USER_AI_ALLOWED_BASE_URLS;
    if (allowlist) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(allowlist);
      } catch {
        throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 JSON 数组。");
      }
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 URL 字符串数组。");
      const allowed = new Set(parsed.map((value) => normalizeBaseUrl(value, preset.provider)));
      if (!allowed.has(baseUrl)) throw new RequestError("该连接方案未获管理员授权。", 403);
    }
  }
  return validateUserAiConfig(preset);
}

export function encryptApiKey(apiKey: string) {
  const keyring = getEncryptionKeyring();
  const key = keyring.keys.get(keyring.activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    apiKeyCiphertext: ciphertext.toString("base64url"),
    apiKeyIv: iv.toString("base64url"),
    apiKeyAuthTag: cipher.getAuthTag().toString("base64url"),
    encryptionKeyId: keyring.activeKeyId,
  };
}

export function decryptApiKey(encrypted: Pick<typeof userAiConfigs.$inferSelect, "apiKeyCiphertext" | "apiKeyIv" | "apiKeyAuthTag" | "encryptionKeyId">) {
  const key = getEncryptionKeyring().keys.get(encrypted.encryptionKeyId);
  if (!key) throw new Error("找不到用于解密用户模型 API Key 的密钥。");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.apiKeyIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encrypted.apiKeyAuthTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.apiKeyCiphertext, "base64url")), decipher.final()]).toString("utf8");
}

function toPublicConfig(row: typeof userAiConfigs.$inferSelect): PublicUserAiConfig {
  const storedPreset = row.presetId === CUSTOM_USER_AI_PRESET_ID
    ? CUSTOM_USER_AI_PRESET_ID
    : getConnectionPreset(row.presetId ?? "")?.id;
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
  const rows = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).limit(1);
  return rows[0] ? toPublicConfig(rows[0]) : null;
}

function resolveInput(input: UserAiConfigInput | LegacyUserAiConfigInput) {
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
  const resolved = resolveInput(input);
  const { apiKey, provider, baseUrl, model } = resolved;
  const existing = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).limit(1);
  if (!apiKey && !existing[0]) throw new RequestError("首次测试必须填写 API Key。");
  const resolvedApiKey = apiKey ?? decryptApiKey(existing[0]!);
  return { provider, baseUrl, model, apiKey: resolvedApiKey } satisfies UserAiModelConfig;
}

export async function saveUserAiConfig(userId: string, input: UserAiConfigInput | LegacyUserAiConfigInput) {
  const resolved = resolveInput(input);
  const { apiKey, presetId, name, provider, baseUrl, model } = resolved;
  const normalized = { provider, baseUrl, model };
  const existing = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).limit(1);
  if (!apiKey && !existing[0]) throw new RequestError("首次保存必须填写 API Key。");

  let encrypted = apiKey ? encryptApiKey(apiKey) : existing[0]!;
  if (!apiKey && existing[0] && existing[0].encryptionKeyId !== getEncryptionKeyring().activeKeyId) {
    encrypted = encryptApiKey(decryptApiKey(existing[0]));
  }
  const values = {
    presetId,
    name: presetId === CUSTOM_USER_AI_PRESET_ID ? (name ?? existing[0]?.name ?? null) : null,
    ...normalized,
    apiKeyCiphertext: encrypted.apiKeyCiphertext,
    apiKeyIv: encrypted.apiKeyIv,
    apiKeyAuthTag: encrypted.apiKeyAuthTag,
    encryptionKeyId: encrypted.encryptionKeyId,
    apiKeyLast4: apiKey ? apiKey.slice(-4) : existing[0]!.apiKeyLast4,
  };
  if (existing[0]) {
    await getDb().update(userAiConfigs).set(values).where(eq(userAiConfigs.userId, userId));
    return toPublicConfigValues({ presetId, name: values.name ?? undefined, ...normalized, baseUrl: normalized.baseUrl ?? "", apiKeyLast4: values.apiKeyLast4 });
  }

  await getDb().insert(userAiConfigs).values({ userId, ...values });
  return toPublicConfigValues({ presetId, name: values.name ?? undefined, ...normalized, baseUrl: normalized.baseUrl ?? "", apiKeyLast4: values.apiKeyLast4 });
}

export async function deleteUserAiConfig(userId: string) {
  await getDb().delete(userAiConfigs).where(eq(userAiConfigs.userId, userId));
}

export async function getUserAiModelConfig(userId: string): Promise<UserAiModelConfig | null> {
  const rows = await getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const config = validateUserAiConfig(
    { provider: row.provider, baseUrl: row.baseUrl ?? "", model: row.model },
    { allowUnlistedCompatibleUrl: row.presetId === CUSTOM_USER_AI_PRESET_ID },
  );
  const apiKey = decryptApiKey(row);
  const activeKeyId = getEncryptionKeyring().activeKeyId;
  if (row.encryptionKeyId !== activeKeyId) {
    const reencrypted = encryptApiKey(apiKey);
    await getDb().update(userAiConfigs).set(reencrypted).where(eq(userAiConfigs.userId, userId));
  }
  return { ...config, apiKey };
}
