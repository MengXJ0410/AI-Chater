import { describe, expect, it } from "vitest";
import { createLegacyWorkspaceConfigs, filterWorkspaceConfigs, formatMaskedApiKey, isWorkspaceConfigFallbackStatus, normalizeSavedWorkspaceConfigs } from "@/lib/workspace-configs";

describe("workspace configuration adapters", () => {
  it("converts current single chat and image configs into a unified list", () => {
    const configs = createLegacyWorkspaceConfigs(
      { presetId: "custom", name: "主对话", provider: "openai-compatible", baseUrl: "https://api.example.com/v1", model: "chat-model", apiKeyConfigured: true, apiKeyLast4: "1234" },
      { name: "主生图", provider: "xai-compatible", baseUrl: "https://api.x.ai/v1", model: "image-model", apiKeyConfigured: true, apiKeyLast4: "5678" },
    );
    expect(configs).toHaveLength(2);
    expect(configs.map((config) => config.runtimePresetId)).toEqual(["user-config", "user-image-config"]);
    expect(filterWorkspaceConfigs(configs, "image")).toEqual([expect.objectContaining({ name: "主生图" })]);
  });

  it("normalizes future multi-config responses and drops invalid records", () => {
    expect(normalizeSavedWorkspaceConfigs([{ id: "1", kind: "chat", name: "配置", provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt", apiKeyConfigured: true, apiKeyLast4: "xx1234", runtimePresetId: "user-chat-config:1" }, { bad: true }]))
      .toEqual([expect.objectContaining({ id: "1", apiKeyLast4: "1234" })]);
  });

  it("only falls back for unavailable multi-config endpoints and masks secrets", () => {
    expect(isWorkspaceConfigFallbackStatus(404)).toBe(true);
    expect(isWorkspaceConfigFallbackStatus(501)).toBe(true);
    expect(isWorkspaceConfigFallbackStatus(401)).toBe(false);
    expect(formatMaskedApiKey("1234")).toBe("•••••••• 1234");
    expect(formatMaskedApiKey("super-secret-key")).not.toContain("super-secret");
  });
});
