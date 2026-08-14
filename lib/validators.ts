import { z } from "zod";
import { aiProviderSchema } from "@/lib/config";

const passwordSchema = z.string().min(8, "密码至少需要 8 位。").max(128, "密码不能超过 128 位。");

export const credentialsSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_-]{3,32}$/, "用户名只能使用 3-32 位字母、数字、下划线或连字符。"),
  password: passwordSchema,
});

export const passwordChangeSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: passwordSchema,
});

export const userAiConfigSchema = z.object({
  provider: aiProviderSchema,
  baseUrl: z.string().trim().max(512).default(""),
  model: z.string().trim().min(1, "请输入模型名称。").max(160, "模型名称不能超过 160 个字符。"),
  apiKey: z.string().trim().min(1, "请输入 API Key。").max(4096, "API Key 不能超过 4096 个字符。").optional(),
});

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export const conversationSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const renameConversationSchema = z.object({
  title: z.string().trim().min(1, "请输入标题。").max(120, "标题不能超过 120 个字符。"),
});

export const chatSchema = z.object({
  conversationId: z.string().uuid(),
  presetId: z.string().min(1).max(64),
  text: z.string().trim().max(16000).default(""),
  attachmentIds: z.array(z.string().uuid()).max(4).default([]),
}).refine((value) => value.text.length > 0 || value.attachmentIds.length > 0, {
  message: "请输入消息或添加图片。",
});
