import { afterEach, describe, expect, it } from "vitest";
import { getAiPresets } from "@/lib/config";
import { chatSchema, credentialsSchema } from "@/lib/validators";

const originalPresets = process.env.AI_PRESETS_JSON;

afterEach(() => {
  if (originalPresets === undefined) delete process.env.AI_PRESETS_JSON;
  else process.env.AI_PRESETS_JSON = originalPresets;
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
});
