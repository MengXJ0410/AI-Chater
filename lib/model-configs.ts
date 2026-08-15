import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { imageGenerations, userAiConfigs, userImageConfigs } from "@/lib/db/schema";
import { auditModelConfig } from "@/lib/model-controls";
import { RequestError } from "@/lib/http";
import { getActiveEncryptionKeyId, decryptApiKey, encryptApiKey, resolveUserAiInput, validateUserAiConfig, type UserAiConfigInput, type UserAiModelConfig } from "@/lib/user-ai-config";
import { imageCapabilities, resolveStoredImageConnection, rotatedImageCredentials, validateImageConnection, type ImageConnection, type ImageProvider } from "@/lib/image-config";
import type { z } from "zod";
import type { modelConfigCreateSchema, modelConfigUpdateSchema } from "@/lib/validators";

type ModelConfigInput = z.infer<typeof modelConfigCreateSchema> | z.infer<typeof modelConfigUpdateSchema>;
export type PublicModelConfig = {
  id: string; kind: "chat" | "image"; name: string; provider: string; baseUrl: string; model: string;
  apiKeyConfigured: true; apiKeyLast4: string; runtimePresetId: string; connectionPresetId?: string; createdAt: Date; updatedAt: Date;
};

const chatRuntimeId = (id: string) => `user-chat-config:${id}`;
const imageRuntimeId = (id: string) => `user-image-config:${id}`;
export const LEGACY_CHAT_RUNTIME_ID = "user-config";
export const LEGACY_IMAGE_RUNTIME_ID = "user-image-config";

function chatPublic(row: typeof userAiConfigs.$inferSelect): PublicModelConfig {
  return { id: row.id, kind: "chat", name: row.name, provider: row.provider, baseUrl: row.baseUrl ?? "", model: row.model, apiKeyConfigured: true, apiKeyLast4: row.apiKeyLast4, runtimePresetId: chatRuntimeId(row.id), connectionPresetId: row.connectionPresetId ?? undefined, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function imagePublic(row: typeof userImageConfigs.$inferSelect): PublicModelConfig {
  return { id: row.id, kind: "image", name: row.name, provider: row.provider, baseUrl: row.baseUrl, model: row.model, apiKeyConfigured: true, apiKeyLast4: row.apiKeyLast4, runtimePresetId: imageRuntimeId(row.id), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function listModelConfigs(userId: string) {
  const [chat, image] = await Promise.all([
    getDb().select().from(userAiConfigs).where(eq(userAiConfigs.userId, userId)).orderBy(desc(userAiConfigs.updatedAt)),
    getDb().select().from(userImageConfigs).where(eq(userImageConfigs.userId, userId)).orderBy(desc(userImageConfigs.updatedAt)),
  ]);
  return [...chat.map(chatPublic), ...image.map(imagePublic)].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function chatInput(input: ModelConfigInput) {
  const presetId = input.connectionPresetId ?? "custom";
  return resolveUserAiInput({ presetId, name: input.name, provider: input.provider as UserAiConfigInput["provider"], baseUrl: input.baseUrl, model: input.model, apiKey: input.apiKey });
}

export async function createModelConfig(userId: string, input: z.infer<typeof modelConfigCreateSchema>) {
  if (input.kind === "chat") {
    const resolved = chatInput(input);
    const encrypted = encryptApiKey(resolved.apiKey!);
    const row = { id: randomUUID(), userId, connectionPresetId: resolved.presetId, name: input.name, provider: resolved.provider, baseUrl: resolved.baseUrl ?? "", model: resolved.model, ...encrypted, apiKeyLast4: resolved.apiKey!.slice(-4) };
    await getDb().insert(userAiConfigs).values(row);
    const config = chatPublic({ ...row, createdAt: new Date(), updatedAt: new Date() });
    await auditModelConfig({ userId, configId: config.id, kind: "chat", action: "created", outcome: "success", provider: config.provider, model: config.model, runtimePresetId: config.runtimePresetId });
    return config;
  }
  const connection = validateImageConnection({ provider: input.provider as ImageProvider, baseUrl: input.baseUrl!, model: input.model! });
  const encrypted = encryptApiKey(input.apiKey!);
  const row = { id: randomUUID(), userId, name: input.name, ...connection, ...encrypted, apiKeyLast4: input.apiKey!.slice(-4) };
  await getDb().insert(userImageConfigs).values(row);
  const config = imagePublic({ ...row, createdAt: new Date(), updatedAt: new Date() });
  await auditModelConfig({ userId, configId: config.id, kind: "image", action: "created", outcome: "success", provider: config.provider, model: config.model, runtimePresetId: config.runtimePresetId });
  return config;
}

export async function updateModelConfig(userId: string, id: string, input: z.infer<typeof modelConfigUpdateSchema>) {
  if (input.kind === "chat") {
    const current = (await getDb().select().from(userAiConfigs).where(and(eq(userAiConfigs.id, id), eq(userAiConfigs.userId, userId))).limit(1))[0];
    if (!current) throw new RequestError("配置不存在。", 404);
    const resolved = chatInput(input);
    const encrypted = input.apiKey ? encryptApiKey(input.apiKey) : current.encryptionKeyId === getActiveEncryptionKeyId() ? current : encryptApiKey(decryptApiKey(current));
    const values = { connectionPresetId: resolved.presetId, name: input.name, provider: resolved.provider, baseUrl: resolved.baseUrl ?? "", model: resolved.model, apiKeyCiphertext: encrypted.apiKeyCiphertext, apiKeyIv: encrypted.apiKeyIv, apiKeyAuthTag: encrypted.apiKeyAuthTag, encryptionKeyId: encrypted.encryptionKeyId, apiKeyLast4: input.apiKey ? input.apiKey.slice(-4) : current.apiKeyLast4 };
    await getDb().update(userAiConfigs).set(values).where(eq(userAiConfigs.id, id));
    const config = { ...chatPublic(current), ...values, runtimePresetId: chatRuntimeId(id), createdAt: current.createdAt, updatedAt: new Date() };
    await auditModelConfig({ userId, configId: id, kind: "chat", action: "updated", outcome: "success", provider: config.provider, model: config.model, runtimePresetId: config.runtimePresetId });
    return config;
  }
  const current = (await getDb().select().from(userImageConfigs).where(and(eq(userImageConfigs.id, id), eq(userImageConfigs.userId, userId))).limit(1))[0];
  if (!current) throw new RequestError("配置不存在。", 404);
  const connection = validateImageConnection({ provider: input.provider as ImageProvider, baseUrl: input.baseUrl!, model: input.model! });
  const encrypted = input.apiKey ? encryptApiKey(input.apiKey) : rotatedImageCredentials(current) ?? current;
  const values = { name: input.name, ...connection, apiKeyCiphertext: encrypted.apiKeyCiphertext, apiKeyIv: encrypted.apiKeyIv, apiKeyAuthTag: encrypted.apiKeyAuthTag, encryptionKeyId: encrypted.encryptionKeyId, apiKeyLast4: input.apiKey ? input.apiKey.slice(-4) : current.apiKeyLast4 };
  await getDb().transaction(async (tx) => {
    await tx.update(imageGenerations).set({ status: "cancelled", completedAt: new Date() }).where(and(eq(imageGenerations.imageConfigId, id), eq(imageGenerations.status, "queued")));
    await tx.update(imageGenerations).set({ status: "cancel_requested" }).where(and(eq(imageGenerations.imageConfigId, id), eq(imageGenerations.status, "running")));
    await tx.update(userImageConfigs).set(values).where(eq(userImageConfigs.id, id));
  });
  const config = { ...imagePublic(current), ...values, runtimePresetId: imageRuntimeId(id), createdAt: current.createdAt, updatedAt: new Date() };
  await auditModelConfig({ userId, configId: id, kind: "image", action: "updated", outcome: "success", provider: config.provider, model: config.model, runtimePresetId: config.runtimePresetId });
  return config;
}

export async function deleteModelConfig(userId: string, id: string) {
  const [chat, image] = await Promise.all([
    getDb().select().from(userAiConfigs).where(and(eq(userAiConfigs.id, id), eq(userAiConfigs.userId, userId))).limit(1),
    getDb().select().from(userImageConfigs).where(and(eq(userImageConfigs.id, id), eq(userImageConfigs.userId, userId))).limit(1),
  ]);
  if (chat[0]) { const config = chatPublic(chat[0]); await getDb().delete(userAiConfigs).where(eq(userAiConfigs.id, id)); await auditModelConfig({ userId, configId: id, kind: "chat", action: "deleted", outcome: "success", provider: config.provider, model: config.model, runtimePresetId: config.runtimePresetId }); return; }
  if (!image[0]) throw new RequestError("配置不存在。", 404);
  const config = imagePublic(image[0]);
  await getDb().transaction(async (tx) => {
    await tx.update(imageGenerations).set({ status: "cancelled", completedAt: new Date() }).where(and(eq(imageGenerations.imageConfigId, id), eq(imageGenerations.status, "queued")));
    await tx.update(imageGenerations).set({ status: "cancel_requested" }).where(and(eq(imageGenerations.imageConfigId, id), eq(imageGenerations.status, "running")));
    await tx.delete(userImageConfigs).where(eq(userImageConfigs.id, id));
  });
  await auditModelConfig({ userId, configId: id, kind: "image", action: "deleted", outcome: "success", provider: config.provider, model: config.model, runtimePresetId: config.runtimePresetId });
}

export async function chatConnectionForPreset(userId: string, presetId: string): Promise<{ connection: UserAiModelConfig; config: PublicModelConfig } | null> {
  const id = presetId.startsWith("user-chat-config:") ? presetId.slice("user-chat-config:".length) : undefined;
  const rows = await getDb().select().from(userAiConfigs).where(and(eq(userAiConfigs.userId, userId), ...(id ? [eq(userAiConfigs.id, id)] : []))).orderBy(desc(userAiConfigs.updatedAt)).limit(1);
  const row = rows[0]; if (!row) return null;
  const connection = validateUserAiConfig({ provider: row.provider, baseUrl: row.baseUrl ?? "", model: row.model }, { allowUnlistedCompatibleUrl: row.connectionPresetId === "custom" });
  const apiKey = decryptApiKey(row);
  if (row.encryptionKeyId !== getActiveEncryptionKeyId()) await getDb().update(userAiConfigs).set(encryptApiKey(apiKey)).where(eq(userAiConfigs.id, row.id));
  return { connection: { ...connection, apiKey }, config: chatPublic(row) };
}

export async function imageConnectionForPreset(userId: string, presetId: string): Promise<{ connection: ImageConnection; config: PublicModelConfig } | null> {
  const id = presetId.startsWith("user-image-config:") ? presetId.slice("user-image-config:".length) : undefined;
  const rows = await getDb().select().from(userImageConfigs).where(and(eq(userImageConfigs.userId, userId), ...(id ? [eq(userImageConfigs.id, id)] : []))).orderBy(desc(userImageConfigs.updatedAt)).limit(1);
  const row = rows[0]; if (!row) return null;
  const connection = resolveStoredImageConnection(row);
  const rotated = rotatedImageCredentials(row); if (rotated) await getDb().update(userImageConfigs).set(rotated).where(eq(userImageConfigs.id, row.id));
  return { connection, config: imagePublic(row) };
}

export function imagePreset(config: PublicModelConfig) { return { id: config.runtimePresetId, label: config.name, model: config.model, ...imageCapabilities(config.provider as ImageProvider) }; }
