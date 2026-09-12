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
