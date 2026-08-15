import { randomUUID } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { imageGenerations, userImageConfigs, users } from "@/lib/db/schema";
import { RequestError } from "@/lib/http";
import { decryptApiKey, encryptApiKey, getActiveEncryptionKeyId, normalizeBaseUrl } from "@/lib/user-ai-config";
import type { z } from "zod";
import type { imageConfigSchema } from "@/lib/validators";

export const USER_IMAGE_PRESET_ID = "user-image-config";
export const IMAGE_ASPECT_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "2:1", "1:2"] as const;

export type ImageProvider = "xai-compatible" | "openai-compatible";
export type ImageConfigInput = z.infer<typeof imageConfigSchema>;

export type ImageConnection = {
  provider: ImageProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

function allowedBaseUrls() {
  const raw = process.env.USER_AI_ALLOWED_BASE_URLS;
  if (!raw) throw new Error("未配置 USER_AI_ALLOWED_BASE_URLS。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 JSON 数组。");
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new Error("USER_AI_ALLOWED_BASE_URLS 必须是 URL 字符串数组。");
  }
  return new Set(parsed.map((value) => normalizeBaseUrl(value, "openai-compatible")));
}

export function validateImageConnection(input: Pick<ImageConfigInput, "provider" | "baseUrl" | "model">) {
  const baseUrl = normalizeBaseUrl(input.baseUrl, "openai-compatible");
  if (!allowedBaseUrls().has(baseUrl)) throw new RequestError("该图片 Base URL 未获管理员授权。", 403);
  return { provider: input.provider, baseUrl, model: input.model };
}

function toPublic(row: typeof userImageConfigs.$inferSelect) {
  return {
    name: row.name,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKeyConfigured: true as const,
    apiKeyLast4: row.apiKeyLast4,
  };
}

export function resolveStoredImageConnection(row: typeof userImageConfigs.$inferSelect) {
  const connection = validateImageConnection(row);
  return { ...connection, apiKey: decryptApiKey(row) } satisfies ImageConnection;
}

export function rotatedImageCredentials(row: typeof userImageConfigs.$inferSelect) {
  return row.encryptionKeyId === getActiveEncryptionKeyId()
    ? null
    : encryptApiKey(decryptApiKey(row));
}

async function lockActiveUser(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], userId: string) {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE`);
  const active = await tx.select({ id: users.id }).from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
  if (!active[0]) throw new RequestError("账号不可用。", 401);
}

export function imageCapabilities(provider: ImageProvider) {
  return {
    supportsImageGeneration: true,
    supportsImageEdit: false,
    aspectRatios: [...IMAGE_ASPECT_RATIOS],
    resolutions: provider === "xai-compatible" ? ["1k", "2k"] : [],
    qualities: provider === "xai-compatible" ? ["low", "medium", "high"] : [],
    maxImages: 1,
  };
}

export async function getPublicImageConfig(userId: string) {
  const rows = await getDb().select().from(userImageConfigs).where(eq(userImageConfigs.userId, userId)).orderBy(desc(userImageConfigs.updatedAt)).limit(1);
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function saveImageConfig(userId: string, input: ImageConfigInput) {
  const connection = validateImageConnection(input);
  return getDb().transaction(async (tx) => {
    await lockActiveUser(tx, userId);
    const existing = await tx.select().from(userImageConfigs).where(eq(userImageConfigs.userId, userId)).orderBy(desc(userImageConfigs.updatedAt)).limit(1);
    if (!input.apiKey && !existing[0]) throw new RequestError("首次保存必须填写 API Key。");

    const encrypted = input.apiKey ? encryptApiKey(input.apiKey) : rotatedImageCredentials(existing[0]!) ?? existing[0]!;
    const values = {
      name: input.name,
      ...connection,
      apiKeyCiphertext: encrypted.apiKeyCiphertext,
      apiKeyIv: encrypted.apiKeyIv,
      apiKeyAuthTag: encrypted.apiKeyAuthTag,
      encryptionKeyId: encrypted.encryptionKeyId,
      apiKeyLast4: input.apiKey ? input.apiKey.slice(-4) : existing[0]!.apiKeyLast4,
    };
    if (existing[0]) {
      const now = new Date();
      await tx.update(imageGenerations).set({ status: "cancelled", completedAt: now }).where(and(eq(imageGenerations.imageConfigId, existing[0].id), eq(imageGenerations.status, "queued")));
      await tx.update(imageGenerations).set({ status: "cancel_requested" }).where(and(eq(imageGenerations.imageConfigId, existing[0].id), eq(imageGenerations.status, "running")));
      await tx.update(userImageConfigs).set(values).where(eq(userImageConfigs.id, existing[0].id));
    }
    else await tx.insert(userImageConfigs).values({ id: randomUUID(), userId, ...values });
    return {
      name: values.name,
      provider: values.provider,
      baseUrl: values.baseUrl,
      model: values.model,
      apiKeyConfigured: true as const,
      apiKeyLast4: values.apiKeyLast4,
    };
  });
}

export async function deleteImageConfig(userId: string) {
  await getDb().transaction(async (tx) => {
    await lockActiveUser(tx, userId);
    const existing = await tx.select({ id: userImageConfigs.id }).from(userImageConfigs).where(eq(userImageConfigs.userId, userId)).orderBy(desc(userImageConfigs.updatedAt)).limit(1);
    if (!existing[0]) return;
    const now = new Date();
    await tx.update(imageGenerations).set({ status: "cancelled", completedAt: now }).where(and(eq(imageGenerations.imageConfigId, existing[0].id), eq(imageGenerations.status, "queued")));
    await tx.update(imageGenerations).set({ status: "cancel_requested" }).where(and(eq(imageGenerations.imageConfigId, existing[0].id), eq(imageGenerations.status, "running")));
    await tx.delete(userImageConfigs).where(eq(userImageConfigs.id, existing[0].id));
  });
}

export async function resolveImageConnection(userId: string, input?: ImageConfigInput): Promise<ImageConnection> {
  const existing = await getDb().select().from(userImageConfigs).where(eq(userImageConfigs.userId, userId)).orderBy(desc(userImageConfigs.updatedAt)).limit(1);
  if (input) {
    const connection = validateImageConnection(input);
    if (!input.apiKey && !existing[0]) throw new RequestError("首次测试必须填写 API Key。");
    return { ...connection, apiKey: input.apiKey ?? decryptApiKey(existing[0]!) };
  }
  if (!existing[0]) throw new RequestError("请先配置图片模型。", 404);
  const connection = resolveStoredImageConnection(existing[0]);
  const rotated = rotatedImageCredentials(existing[0]);
  if (rotated) await getDb().update(userImageConfigs).set(rotated).where(eq(userImageConfigs.id, existing[0].id));
  return connection;
}
