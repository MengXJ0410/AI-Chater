export type WorkspaceConfigKind = "chat" | "image";
export type WorkspaceConfigFilter = "all" | WorkspaceConfigKind;
export type WorkspaceConfigMode = "legacy" | "multi";

export type SavedWorkspaceConfig = {
  id: string;
  kind: WorkspaceConfigKind;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
  runtimePresetId: string;
  connectionPresetId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type LegacyChatConfig = {
  presetId: string;
  name?: string;
  label?: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
};

type LegacyImageConfig = {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
};

export function isWorkspaceConfigFallbackStatus(status: number) {
  return status === 404 || status === 501;
}

export function normalizeSavedWorkspaceConfigs(value: unknown): SavedWorkspaceConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const config = item as Record<string, unknown>;
    if (
      typeof config.id !== "string"
      || (config.kind !== "chat" && config.kind !== "image")
      || typeof config.name !== "string"
      || typeof config.provider !== "string"
      || typeof config.baseUrl !== "string"
      || typeof config.model !== "string"
      || typeof config.runtimePresetId !== "string"
    ) return [];
    return [{
      id: config.id,
      kind: config.kind,
      name: config.name,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKeyConfigured: config.apiKeyConfigured === true,
      apiKeyLast4: typeof config.apiKeyLast4 === "string" ? config.apiKeyLast4.slice(-4) : "",
      runtimePresetId: config.runtimePresetId,
      connectionPresetId: typeof config.connectionPresetId === "string" ? config.connectionPresetId : undefined,
      createdAt: typeof config.createdAt === "string" ? config.createdAt : undefined,
      updatedAt: typeof config.updatedAt === "string" ? config.updatedAt : undefined,
    } satisfies SavedWorkspaceConfig];
  });
}

export function createLegacyWorkspaceConfigs(chat: LegacyChatConfig | null, image: LegacyImageConfig | null): SavedWorkspaceConfig[] {
  return [
    ...(chat ? [{
      id: "legacy-chat",
      kind: "chat" as const,
      name: chat.name || chat.label || "我的对话配置",
      provider: chat.provider,
      baseUrl: chat.baseUrl,
      model: chat.model,
      apiKeyConfigured: chat.apiKeyConfigured,
      apiKeyLast4: chat.apiKeyLast4.slice(-4),
      runtimePresetId: "user-config",
      connectionPresetId: chat.presetId,
    }] : []),
    ...(image ? [{
      id: "legacy-image",
      kind: "image" as const,
      name: image.name || "我的生图配置",
      provider: image.provider,
      baseUrl: image.baseUrl,
      model: image.model,
      apiKeyConfigured: image.apiKeyConfigured,
      apiKeyLast4: image.apiKeyLast4.slice(-4),
      runtimePresetId: "user-image-config",
    }] : []),
  ];
}

export function filterWorkspaceConfigs(configs: SavedWorkspaceConfig[], filter: WorkspaceConfigFilter) {
  return filter === "all" ? configs : configs.filter((config) => config.kind === filter);
}

export function formatMaskedApiKey(last4: string) {
  return last4 ? `•••••••• ${last4.slice(-4)}` : "••••••••";
}
