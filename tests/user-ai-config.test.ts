import { afterEach, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, normalizeBaseUrl, toUserAiPreset, validateUserAiConfig } from "@/lib/user-ai-config";

const originalKeys = process.env.AI_CONFIG_ENCRYPTION_KEYS;
const originalActiveKeyId = process.env.AI_CONFIG_ACTIVE_KEY_ID;
const originalAllowedUrls = process.env.USER_AI_ALLOWED_BASE_URLS;

function setKeyring(keys: Record<string, Buffer>, activeKeyId: string) {
  process.env.AI_CONFIG_ENCRYPTION_KEYS = JSON.stringify(Object.fromEntries(
    Object.entries(keys).map(([id, key]) => [id, key.toString("base64")]),
  ));
  process.env.AI_CONFIG_ACTIVE_KEY_ID = activeKeyId;
}

afterEach(() => {
  if (originalKeys === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEYS;
  else process.env.AI_CONFIG_ENCRYPTION_KEYS = originalKeys;
  if (originalActiveKeyId === undefined) delete process.env.AI_CONFIG_ACTIVE_KEY_ID;
  else process.env.AI_CONFIG_ACTIVE_KEY_ID = originalActiveKeyId;
  if (originalAllowedUrls === undefined) delete process.env.USER_AI_ALLOWED_BASE_URLS;
  else process.env.USER_AI_ALLOWED_BASE_URLS = originalAllowedUrls;
});

describe("user AI configuration encryption", () => {
  it("encrypts API keys with AES-256-GCM and decrypts an old key-ring entry", () => {
    const firstKey = Buffer.alloc(32, 1);
    const secondKey = Buffer.alloc(32, 2);
    setKeyring({ v1: firstKey }, "v1");
    const encrypted = encryptApiKey("secret-api-key");
    expect(encrypted.apiKeyCiphertext).not.toContain("secret-api-key");
    expect(encrypted.encryptionKeyId).toBe("v1");

    setKeyring({ v1: firstKey, v2: secondKey }, "v2");
    expect(decryptApiKey(encrypted)).toBe("secret-api-key");
    expect(encryptApiKey("next-key").encryptionKeyId).toBe("v2");
  });
});

describe("user AI configuration validation", () => {
  it("only accepts a normalized allowlisted compatible endpoint", () => {
    process.env.USER_AI_ALLOWED_BASE_URLS = JSON.stringify(["https://www.yyapi.cloud/v1"]);
    expect(normalizeBaseUrl("https://www.yyapi.cloud/v1/")).toBe("https://www.yyapi.cloud/v1");
    expect(validateUserAiConfig({ provider: "openai-compatible", baseUrl: "https://www.yyapi.cloud/v1/", model: "gpt-4o-mini" }))
      .toMatchObject({ baseUrl: "https://www.yyapi.cloud/v1" });
  });

  it("rejects unsafe, unapproved, and non-official provider endpoints", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:3000/v1", "openai-compatible")).toBe("http://127.0.0.1:3000/v1");
    process.env.USER_AI_ALLOWED_BASE_URLS = JSON.stringify(["https://www.yyapi.cloud/v1"]);
    expect(() => validateUserAiConfig({ provider: "openai-compatible", baseUrl: "https://unapproved.example/v1", model: "model" })).toThrow("未获管理员授权");
    expect(() => validateUserAiConfig({ provider: "openai", baseUrl: "https://www.yyapi.cloud/v1", model: "gpt-4o-mini" })).toThrow("官方 Base URL");
  });

  it("exposes a configured user connection as a non-image virtual preset", () => {
    expect(toUserAiPreset({ provider: "openai-compatible", baseUrl: "https://www.yyapi.cloud/v1", model: "gpt-4o-mini", apiKeyConfigured: true, apiKeyLast4: "1234" }))
      .toEqual({ id: "user-config", label: "我的配置", model: "gpt-4o-mini", supportsImages: false });
  });
});
