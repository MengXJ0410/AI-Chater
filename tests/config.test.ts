import { afterEach, describe, expect, it } from "vitest";
import { getAiPresets } from "@/lib/config";
import { decryptApiKey, encryptApiKey, normalizeBaseUrl, validateUserAiConfig } from "@/lib/user-ai-config";
import { chatSchema, credentialsSchema, userAiConfigSchema } from "@/lib/validators";

const originalPresets = process.env.AI_PRESETS_JSON;
const originalEncryptionKey = process.env.AI_CONFIG_ENCRYPTION_KEY;

afterEach(() => {
  if (originalPresets === undefined) delete process.env.AI_PRESETS_JSON;
  else process.env.AI_PRESETS_JSON = originalPresets;
  if (originalEncryptionKey === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEY;
  else process.env.AI_CONFIG_ENCRYPTION_KEY = originalEncryptionKey;
});

describe("AI preset configuration", () => {
  it("returns an empty list when no preset is configured", () => {
    delete process.env.AI_PRESETS_JSON;
    expect(getAiPresets()).toEqual([]);
  });

  it("parses a valid OpenAI-compatible preset", () => {
    process.env.AI_PRESETS_JSON = JSON.stringify([{
      id: "grok",
      label: "Grok",
      provider: "openai-compatible",
      model: "grok-4",
      apiKeyEnv: "XAI_API_KEY",
      baseUrl: "https://api.x.ai/v1",
      supportsImages: true,
    }]);
    expect(getAiPresets()).toHaveLength(1);
  });

  it("rejects duplicate preset ids", () => {
    process.env.AI_PRESETS_JSON = JSON.stringify(Array(2).fill({
      id: "same", label: "Same", provider: "openai", model: "gpt", apiKeyEnv: "OPENAI_API_KEY", supportsImages: false,
    }));
    expect(() => getAiPresets()).toThrow("Preset ids must be unique");
  });
});

describe("request validation", () => {
  it("accepts valid credentials and chat data", () => {
    expect(credentialsSchema.parse({ username: "demo_user", password: "password123" }).username).toBe("demo_user");
    expect(chatSchema.parse({ conversationId: "1b4d6d34-7d46-4a94-a716-2d2466a9d2a9", presetId: "grok", text: "你好" }).text).toBe("你好");
  });

  it("rejects empty messages and short passwords", () => {
    expect(() => credentialsSchema.parse({ username: "demo", password: "short" })).toThrow();
    expect(() => chatSchema.parse({ conversationId: "1b4d6d34-7d46-4a94-a716-2d2466a9d2a9", presetId: "grok", text: "" })).toThrow();
  });

  it("validates user model configuration and safe base URLs", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1/", "openai-compatible")).toBe("https://api.example.com/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:11434/v1", "openai-compatible")).toBe("http://127.0.0.1:11434/v1");
    expect(() => normalizeBaseUrl("http://api.example.com/v1", "openai-compatible")).toThrow();
    expect(() => normalizeBaseUrl("https://192.168.1.10/v1", "openai-compatible")).toThrow();
    expect(() => normalizeBaseUrl("http://127.0.0.1:11434/v1", "openai")).toThrow();
    expect(validateUserAiConfig({ provider: "openai-compatible", baseUrl: "https://api.example.com/v1", model: "model" })).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      model: "model",
    });
    expect(() => userAiConfigSchema.parse({ provider: "unknown", model: "model" })).toThrow();
  });

  it("encrypts API keys and rejects tampered ciphertext", () => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptApiKey("secret-api-key");
    expect(decryptApiKey(encrypted)).toBe("secret-api-key");
    expect(() => decryptApiKey({ ...encrypted, apiKeyCiphertext: `${encrypted.apiKeyCiphertext}x` })).toThrow();
  });
});
