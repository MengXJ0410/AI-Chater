import { afterEach, describe, expect, it, vi } from "vitest";
import { modelStreamErrorHandler, testModelConnection } from "@/lib/ai";
import { getAiPresets, getUserAiConnectionPresets } from "@/lib/config";
import { decryptApiKey, encryptApiKey, normalizeBaseUrl, validateUserAiConfig } from "@/lib/user-ai-config";
import { chatSchema, credentialsSchema, userAiConfigSchema } from "@/lib/validators";

const originalPresets = process.env.AI_PRESETS_JSON;
const originalEncryptionKey = process.env.AI_CONFIG_ENCRYPTION_KEY;

afterEach(() => {
  if (originalPresets === undefined) delete process.env.AI_PRESETS_JSON;
  else process.env.AI_PRESETS_JSON = originalPresets;
  if (originalEncryptionKey === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEY;
  else process.env.AI_CONFIG_ENCRYPTION_KEY = originalEncryptionKey;
  vi.unstubAllGlobals();
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
    expect(() => userAiConfigSchema.parse({ presetId: "yyapi", provider: "openai-compatible", baseUrl: "https://evil.example", model: "other" })).toThrow();
    expect(userAiConfigSchema.parse({ presetId: "custom", provider: "openai-compatible", baseUrl: "https://api.example.com/v1", model: "custom-model" })).toMatchObject({ presetId: "custom" });
    expect(userAiConfigSchema.parse({ presetId: "custom", name: "我的中转站", provider: "openai-compatible", baseUrl: "https://api.example.com/v1", model: "custom-model" })).toMatchObject({ name: "我的中转站" });
    expect(() => userAiConfigSchema.parse({ presetId: "yyapi", name: "错误命名", apiKey: "key" })).toThrow("固定连接方案不接受");
    expect(() => userAiConfigSchema.parse({ presetId: "custom", provider: "openai-compatible", model: "custom-model" })).toThrow("请输入 Base URL");
  });

  it("encrypts API keys and rejects tampered ciphertext", () => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptApiKey("secret-api-key");
    expect(decryptApiKey(encrypted)).toBe("secret-api-key");
    expect(() => decryptApiKey({ ...encrypted, apiKeyCiphertext: `${encrypted.apiKeyCiphertext}x` })).toThrow();
  });

  it("requires a server encryption key before accepting user credentials", () => {
    delete process.env.AI_CONFIG_ENCRYPTION_KEY;
    delete process.env.AI_CONFIG_ENCRYPTION_KEYS;
    delete process.env.AI_CONFIG_ACTIVE_KEY_ID;
    expect(() => encryptApiKey("secret-api-key")).toThrow("AI_CONFIG_ENCRYPTION_KEY");
  });

  it("logs only safe model error metadata", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    modelStreamErrorHandler(Object.assign(new Error("upstream body contains a secret-api-key"), { statusCode: 401 }));
    expect(log).toHaveBeenCalledWith("AI model request failed", { name: "Error", statusCode: 401 });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-api-key");
    log.mockRestore();
  });

  it("keeps the built-in connection directory fixed", () => {
    expect(getUserAiConnectionPresets()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "yyapi", provider: "openai-compatible", baseUrl: "https://www.yyapi.cloud/v1", model: "grok-4" }),
      expect.objectContaining({ id: "yyapi-grok-01", provider: "openai-compatible", baseUrl: "https://www.yyapi.cloud/v1", model: "grok-4.5" }),
      expect.objectContaining({ id: "openrouter", provider: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" }),
    ]));
    expect(getUserAiConnectionPresets()).toHaveLength(8);
  });

  it("tests an OpenAI-compatible connection through chat completions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
      return new Response(JSON.stringify({
        id: "test-completion",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(testModelConnection({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "test-model",
      apiKey: "test-key",
    }, AbortSignal.timeout(5_000))).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
