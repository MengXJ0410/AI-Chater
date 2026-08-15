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
  presetId: z.string().trim().min(1, "请选择连接方案。").max(64, "连接方案无效。"),
  name: z.string().trim().min(1, "请输入配置名称。").max(80, "配置名称不能超过 80 个字符。").optional(),
  provider: aiProviderSchema.optional(),
  baseUrl: z.string().trim().max(512, "Base URL 不能超过 512 个字符。").optional(),
  model: z.string().trim().max(160, "模型名称不能超过 160 个字符。").optional(),
  apiKey: z.string().trim().min(1, "请输入 API Key。").max(4096, "API Key 不能超过 4096 个字符。").optional(),
}).strict().superRefine((value, context) => {
  const customFields = [value.name, value.provider, value.baseUrl, value.model];
  if (value.presetId === "custom") {
    if (!value.provider) context.addIssue({ code: "custom", path: ["provider"], message: "请选择 Provider。" });
    if (!value.baseUrl) context.addIssue({ code: "custom", path: ["baseUrl"], message: "请输入 Base URL。" });
    if (!value.model) context.addIssue({ code: "custom", path: ["model"], message: "请输入模型名称。" });
  } else if (customFields.some((field) => field !== undefined)) {
    context.addIssue({ code: "custom", message: "固定连接方案不接受自定义 Provider、Base URL 或 Model。" });
  }
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

export const imageProviderSchema = z.enum(["xai-compatible", "openai-compatible"]);
export const imageResolutionSchema = z.enum(["1k", "2k"]);
export const imageQualitySchema = z.enum(["low", "medium", "high"]);
export const imageAspectRatioSchema = z.enum(["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "2:1", "1:2"]);

export const imageConfigSchema = z.object({
  name: z.string().trim().min(1, "请输入生图配置名称。").max(80, "生图配置名称不能超过 80 个字符。"),
  provider: imageProviderSchema,
  baseUrl: z.string().trim().max(512, "Base URL 不能超过 512 个字符。"),
  model: z.string().trim().min(1, "请输入图片模型名称。").max(160, "模型名称不能超过 160 个字符。"),
  apiKey: z.string().trim().min(1, "请输入 API Key。").max(4096, "API Key 不能超过 4096 个字符。").optional(),
}).strict();

const modelConfigBaseSchema = z.object({
  kind: z.enum(["chat", "image"]),
  name: z.string().trim().min(1, "请输入配置名称。").max(80, "配置名称不能超过 80 个字符。"),
  connectionPresetId: z.string().trim().min(1).max(64).optional(),
  provider: z.union([aiProviderSchema, imageProviderSchema]).optional(),
  baseUrl: z.string().trim().max(512, "Base URL 不能超过 512 个字符。").optional(),
  model: z.string().trim().max(160, "模型名称不能超过 160 个字符。").optional(),
  apiKey: z.string().trim().min(1, "请输入 API Key。").max(4096, "API Key 不能超过 4096 个字符。").optional(),
}).strict();

export const modelConfigCreateSchema = modelConfigBaseSchema.superRefine((value, context) => {
  if (!value.apiKey) context.addIssue({ code: "custom", path: ["apiKey"], message: "首次创建必须填写 API Key。" });
  if (value.kind === "image") {
    if (!value.provider || !imageProviderSchema.safeParse(value.provider).success) context.addIssue({ code: "custom", path: ["provider"], message: "请选择图片 Provider。" });
    if (!value.baseUrl) context.addIssue({ code: "custom", path: ["baseUrl"], message: "请输入 Base URL。" });
    if (!value.model) context.addIssue({ code: "custom", path: ["model"], message: "请输入图片模型名称。" });
  } else if (value.connectionPresetId === "custom" && (!value.provider || !value.baseUrl || !value.model)) {
    context.addIssue({ code: "custom", message: "自定义对话配置需要 Provider、Base URL 和 Model。" });
  }
});

export const modelConfigUpdateSchema = modelConfigBaseSchema.superRefine((value, context) => {
  if (value.kind === "image") {
    if (!value.provider || !imageProviderSchema.safeParse(value.provider).success || !value.baseUrl || !value.model) context.addIssue({ code: "custom", message: "图片配置需要 Provider、Base URL 和 Model。" });
  } else if (value.connectionPresetId === "custom" && (!value.provider || !value.baseUrl || !value.model)) {
    context.addIssue({ code: "custom", message: "自定义对话配置需要 Provider、Base URL 和 Model。" });
  }
});

export const imageGenerationSchema = z.object({
  requestId: z.string().uuid(),
  conversationId: z.string().uuid(),
  imagePresetId: z.string().min(1).max(64),
  prompt: z.string().trim().min(1, "请输入生图提示词。").max(4000, "提示词不能超过 4000 个字符。"),
  referenceAttachmentIds: z.array(z.string().uuid()).max(4).default([]),
  aspectRatio: imageAspectRatioSchema.default("1:1"),
  resolution: imageResolutionSchema.default("1k"),
  quality: imageQualitySchema.default("high"),
  source: z.literal("image-mode").default("image-mode"),
}).strict().superRefine((value, context) => {
  if (value.referenceAttachmentIds.length) context.addIssue({ code: "custom", path: ["referenceAttachmentIds"], message: "首期暂不支持参考图编辑。" });
});
