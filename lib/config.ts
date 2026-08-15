import { z } from "zod";

export const aiProviderSchema = z.enum(["openai", "openai-compatible", "xai", "anthropic", "google"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;
export const USER_AI_PRESET_ID = "user-config";

export type UserAiConnectionPreset = {
  id: string;
  label: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
};

const USER_AI_CONNECTION_PRESETS: UserAiConnectionPreset[] = [
  { id: "openai", label: "OpenAI", provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
  { id: "google", label: "Google", provider: "google", baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash" },
  { id: "xai", label: "xAI", provider: "xai", baseUrl: "https://api.x.ai/v1", model: "grok-4" },
  { id: "yyapi", label: "YYAPI", provider: "openai-compatible", baseUrl: "https://www.yyapi.cloud/v1", model: "grok-4" },
  { id: "yyapi-grok-01", label: "YYAPI Grok 4.5", provider: "openai-compatible", baseUrl: "https://www.yyapi.cloud/v1", model: "grok-4.5" },
  { id: "openrouter", label: "OpenRouter", provider: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { id: "deepseek", label: "DeepSeek", provider: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
];

export function getUserAiConnectionPresets(): UserAiConnectionPreset[] {
  return USER_AI_CONNECTION_PRESETS.map((preset) => ({ ...preset }));
}

const presetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]{0,63}$/),
  label: z.string().min(1).max(48),
  provider: aiProviderSchema,
  model: z.string().min(1).max(160),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  baseUrl: z.string().url().optional(),
  supportsImages: z.boolean(),
});

export type AiPreset = z.infer<typeof presetSchema>;
export type PublicAiPreset = Pick<AiPreset, "id" | "label" | "model" | "supportsImages">;

export function getAiPresets(): AiPreset[] {
  const raw = process.env.AI_PRESETS_JSON;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const presets = z.array(presetSchema).min(1).parse(parsed);
    if (new Set(presets.map((preset) => preset.id)).size !== presets.length) {
      throw new Error("Preset ids must be unique.");
    }
    if (presets.some((preset) => preset.id === USER_AI_PRESET_ID)) {
      throw new Error(`Preset id ${USER_AI_PRESET_ID} is reserved.`);
    }
    return presets;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`AI_PRESETS_JSON is invalid: ${message}`);
  }
}

export function getPublicAiPresets(): PublicAiPreset[] {
  return getAiPresets().map(({ id, label, model, supportsImages }) => ({ id, label, model, supportsImages }));
}

export function getUploadDirectory() {
  return process.env.UPLOAD_DIR || "./data/uploads";
}

export function getMaxUploadBytes() {
  const value = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);
  return Number.isSafeInteger(value) && value > 0 ? value : 10 * 1024 * 1024;
}

export function getSessionTtlDays() {
  const value = Number(process.env.SESSION_TTL_DAYS ?? 30);
  return Number.isSafeInteger(value) && value > 0 ? value : 30;
}
