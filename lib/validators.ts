import { z } from "zod";

export const credentialsSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_-]{3,32}$/, "用户名只能使用 3-32 位字母、数字、下划线或连字符。"),
  password: z.string().min(8, "密码至少需要 8 位。").max(128, "密码不能超过 128 位。"),
});

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
