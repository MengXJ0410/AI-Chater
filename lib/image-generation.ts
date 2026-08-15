import { createHash, randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { generateConfiguredImage, logImageError } from "@/lib/ai-image";
import { isDuplicateEntryError } from "@/lib/account";
import { getDb } from "@/lib/db";
import { attachments, conversations, imageGenerations, messages, userImageConfigs, users } from "@/lib/db/schema";
import { resolveStoredImageConnection, rotatedImageCredentials } from "@/lib/image-config";
import { LEGACY_IMAGE_RUNTIME_ID } from "@/lib/model-configs";
import { auditModelConfig, consumeRateLimitInTransaction } from "@/lib/model-controls";
import { RequestError } from "@/lib/http";
import { removeImages, saveGeneratedPng } from "@/lib/uploads";
import type { z } from "zod";
import type { imageGenerationSchema } from "@/lib/validators";

type GenerationInput = z.infer<typeof imageGenerationSchema>;

function requestHash(input: GenerationInput) {
  return createHash("sha256").update(JSON.stringify({
    conversationId: input.conversationId,
    imagePresetId: input.imagePresetId,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    quality: input.quality,
    source: input.source,
  })).digest("hex");
}

export async function publicGeneration(userId: string, id: string) {
  const rows = await getDb().select().from(imageGenerations)
    .where(and(eq(imageGenerations.id, id), eq(imageGenerations.userId, userId))).limit(1);
  const generation = rows[0];
  if (!generation) return null;
  const files = generation.status === "completed"
    ? await getDb().select({
        id: attachments.id,
        mimeType: attachments.mimeType,
        size: attachments.size,
        width: attachments.width,
        height: attachments.height,
      })
      .from(attachments).where(and(eq(attachments.userId, userId), eq(attachments.generationId, id)))
    : [];
  return {
    id: generation.id,
    requestId: generation.requestId,
    status: generation.status,
    provider: generation.provider,
    model: generation.model,
    aspectRatio: generation.aspectRatio,
    resolution: generation.resolution,
    quality: generation.quality,
    errorCode: generation.errorCode,
    createdAt: generation.createdAt,
    startedAt: generation.startedAt,
    completedAt: generation.completedAt,
    attachments: files.map((file) => ({
      id: file.id,
      mimeType: file.mimeType,
      size: file.size,
      ...(file.width === null || file.height === null ? {} : { width: file.width, height: file.height }),
      url: `/api/attachments/${file.id}`,
    })),
  };
}

export async function enqueueImageGeneration(userId: string, input: GenerationInput) {
  const conversation = await getDb().select({ id: conversations.id, title: conversations.title }).from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, userId))).limit(1);
  if (!conversation[0]) throw new RequestError("会话不存在。", 404);
  if (input.imagePresetId !== LEGACY_IMAGE_RUNTIME_ID && !input.imagePresetId.startsWith("user-image-config:")) throw new RequestError("图片预设不存在。", 404);

  const hash = requestHash(input);
  const existing = await getDb().select().from(imageGenerations)
    .where(and(eq(imageGenerations.userId, userId), eq(imageGenerations.requestId, input.requestId))).limit(1);
  if (existing[0]) {
    if (existing[0].requestHash !== hash) throw new RequestError("requestId 已用于其他生图请求。", 409);
    return publicGeneration(userId, existing[0].id);
  }

  const generationId = randomUUID();
  const userMessageId = randomUUID();
  try {
    const duplicateId = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} AND deleted_at IS NULL FOR UPDATE`);
      const duplicate = await tx.select().from(imageGenerations)
        .where(and(eq(imageGenerations.userId, userId), eq(imageGenerations.requestId, input.requestId))).limit(1);
      if (duplicate[0]) {
        if (duplicate[0].requestHash !== hash) throw new RequestError("requestId 已用于其他生图请求。", 409);
        return duplicate[0].id;
      }
      // This is under the same account row lock as duplicate detection, so an
      // idempotent replay cannot consume a second image-generation quota.
      await consumeRateLimitInTransaction(tx, userId, "image_generation");
      const configId = input.imagePresetId.startsWith("user-image-config:") ? input.imagePresetId.slice("user-image-config:".length) : undefined;
      const configs = await tx.select({ id: userImageConfigs.id, provider: userImageConfigs.provider, model: userImageConfigs.model })
        .from(userImageConfigs).where(and(eq(userImageConfigs.userId, userId), ...(configId ? [eq(userImageConfigs.id, configId)] : []))).orderBy(desc(userImageConfigs.updatedAt)).limit(1);
      const config = configs[0];
      if (!config) throw new RequestError("请先配置图片模型。", 404);
      if (config.provider === "openai-compatible" && (input.resolution !== "1k" || input.quality !== "high")) {
        throw new RequestError("OpenAI Compatible 图片连接仅接受默认分辨率和质量。", 400);
      }
      await tx.insert(messages).values({
        id: userMessageId,
        conversationId: input.conversationId,
        role: "user",
        parts: [{ type: "text", text: input.prompt }],
        presetId: input.imagePresetId,
        model: config.model,
      });
      await tx.insert(imageGenerations).values({
        id: generationId,
        requestId: input.requestId,
        requestHash: hash,
        userId,
        conversationId: input.conversationId,
        userMessageId,
        imageConfigId: config.id,
        imagePresetId: input.imagePresetId,
        provider: config.provider,
        model: config.model,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        quality: input.quality,
        source: input.source,
        status: "queued",
      });
      if (conversation[0].title === "新对话") {
        await tx.update(conversations).set({ title: input.prompt.slice(0, 40) }).where(eq(conversations.id, input.conversationId));
      } else {
        await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
      }
      return null;
    });
    if (duplicateId) return publicGeneration(userId, duplicateId);
  } catch (error) {
    if (!isDuplicateEntryError(error)) throw error;
    const duplicate = await getDb().select().from(imageGenerations)
      .where(and(eq(imageGenerations.userId, userId), eq(imageGenerations.requestId, input.requestId))).limit(1);
    if (!duplicate[0] || duplicate[0].requestHash !== hash) throw new RequestError("requestId 已用于其他生图请求。", 409);
    return publicGeneration(userId, duplicate[0].id);
  }
  const generation = await publicGeneration(userId, generationId);
  if (generation) await auditModelConfig({ userId, configId: input.imagePresetId.startsWith("user-image-config:") ? input.imagePresetId.slice("user-image-config:".length) : undefined, kind: "image", action: "generation_requested", outcome: "success", provider: generation.provider, model: generation.model, runtimePresetId: input.imagePresetId, requestId: input.requestId }).catch(() => undefined);
  return generation;
}

export async function cancelImageGeneration(userId: string, id: string) {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    const rows = await tx.select({ status: imageGenerations.status }).from(imageGenerations)
      .where(and(eq(imageGenerations.id, id), eq(imageGenerations.userId, userId))).limit(1);
    if (!rows[0]) throw new RequestError("生图任务不存在。", 404);
    if (rows[0].status === "queued") {
      await tx.update(imageGenerations).set({ status: "cancelled", completedAt: new Date() })
        .where(and(eq(imageGenerations.id, id), eq(imageGenerations.userId, userId), eq(imageGenerations.status, "queued")));
    } else if (rows[0].status === "running") {
      await tx.update(imageGenerations).set({ status: "cancel_requested" })
        .where(and(eq(imageGenerations.id, id), eq(imageGenerations.userId, userId), eq(imageGenerations.status, "running")));
    }
  });
  const generation = await publicGeneration(userId, id);
  if (generation?.status === "cancelled" || generation?.status === "cancel_requested") await auditModelConfig({ userId, kind: "image", action: "generation_cancelled", outcome: "success", provider: generation.provider, model: generation.model, requestId: generation.requestId }).catch(() => undefined);
  return generation;
}

function errorCode(error: unknown) {
  if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) return error.name === "TimeoutError" ? "UPSTREAM_TIMEOUT" : "CANCELLED";
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
  if (status === 401 || status === 403) return "UPSTREAM_AUTH";
  if (status === 429) return "UPSTREAM_RATE_LIMIT";
  return error instanceof RequestError ? "OUTPUT_INVALID" : "UPSTREAM_FAILED";
}

export async function recoverInterruptedImageGenerations() {
  const now = new Date();
  await getDb().update(imageGenerations).set({ status: "failed", errorCode: "WORKER_INTERRUPTED", completedAt: now })
    .where(eq(imageGenerations.status, "running"));
  await getDb().update(imageGenerations).set({ status: "cancelled", errorCode: null, completedAt: now })
    .where(eq(imageGenerations.status, "cancel_requested"));
}

export async function processNextImageGeneration() {
  const rows = await getDb().select().from(imageGenerations)
    .where(eq(imageGenerations.status, "queued")).orderBy(asc(imageGenerations.createdAt)).limit(1);
  const job = rows[0];
  if (!job) return false;
  const claimed = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${job.userId} AND deleted_at IS NULL FOR UPDATE`);
    const activeUser = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.id, job.userId), isNull(users.deletedAt))).limit(1);
    const queued = await tx.select().from(imageGenerations)
      .where(and(eq(imageGenerations.id, job.id), eq(imageGenerations.status, "queued"))).limit(1);
    if (!queued[0]) return null;
    if (!activeUser[0]) {
      await tx.update(imageGenerations).set({ status: "cancelled", completedAt: new Date() })
        .where(eq(imageGenerations.id, job.id));
      return null;
    }
    const configs = await tx.select().from(userImageConfigs).where(and(eq(userImageConfigs.userId, job.userId), eq(userImageConfigs.id, job.imageConfigId ?? ""))).limit(1);
    if (!configs[0]) {
      await tx.update(imageGenerations).set({ status: "failed", errorCode: "CONFIG_MISSING", completedAt: new Date() })
        .where(eq(imageGenerations.id, job.id));
      return null;
    }
    let connection;
    try {
      connection = resolveStoredImageConnection(configs[0]);
      const rotated = rotatedImageCredentials(configs[0]);
      if (rotated) await tx.update(userImageConfigs).set(rotated).where(eq(userImageConfigs.userId, job.userId));
    } catch (error) {
      await tx.update(imageGenerations).set({ status: "failed", errorCode: "CONFIG_INVALID", completedAt: new Date() })
        .where(eq(imageGenerations.id, job.id));
      return { job: queued[0], configError: error };
    }
    await tx.update(imageGenerations).set({ status: "running", startedAt: new Date(), errorCode: null })
      .where(and(eq(imageGenerations.id, job.id), eq(imageGenerations.status, "queued")));
    return { job: queued[0], connection, configError: null };
  });
  if (!claimed) return true;
  if (claimed.configError) {
    logImageError(claimed.configError, { generationId: job.id, userId: job.userId, provider: job.provider, model: job.model, errorCode: "CONFIG_INVALID" });
    return true;
  }

  const controller = new AbortController();
  const timeoutSignal = AbortSignal.timeout(120_000);
  const signal = AbortSignal.any([controller.signal, timeoutSignal]);
  const poll = setInterval(() => {
    void getDb().select({ status: imageGenerations.status }).from(imageGenerations).where(eq(imageGenerations.id, job.id)).limit(1)
      .then((state) => {
        if (!state[0] || state[0].status !== "running") controller.abort(new DOMException("Cancelled", "AbortError"));
      }).catch(() => undefined);
  }, 500);
  let storageKey: string | undefined;
  try {
    const generated = await generateConfiguredImage(claimed.connection!, {
      prompt: claimed.job.prompt,
      aspectRatio: claimed.job.aspectRatio,
      resolution: claimed.job.resolution,
      quality: claimed.job.quality,
    }, signal);
    const saved = await saveGeneratedPng(generated.bytes);
    storageKey = saved.storageKey;
    const assistantMessageId = randomUUID();
    const attachmentId = randomUUID();
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${job.userId} FOR UPDATE`);
      const latest = await tx.select({ status: imageGenerations.status }).from(imageGenerations)
        .where(and(eq(imageGenerations.id, job.id), eq(imageGenerations.userId, job.userId))).limit(1);
      if (!latest[0] || latest[0].status !== "running") throw new DOMException("Cancelled", "AbortError");
      await tx.insert(messages).values({
        id: assistantMessageId,
        conversationId: job.conversationId,
        role: "assistant",
        parts: [{ type: "image", attachmentId }],
        presetId: job.imagePresetId,
        model: claimed.connection!.model,
      });
      await tx.insert(attachments).values({
        id: attachmentId,
        userId: job.userId,
        messageId: assistantMessageId,
        storageKey: saved.storageKey,
        mimeType: saved.mimeType,
        size: saved.size,
        width: saved.width,
        height: saved.height,
        originalName: `generated-${job.id}.png`,
        generationId: job.id,
        origin: "generated",
      });
      await tx.update(imageGenerations).set({ status: "completed", assistantMessageId, completedAt: new Date(), errorCode: null })
        .where(eq(imageGenerations.id, job.id));
      await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, job.conversationId));
    });
    storageKey = undefined;
    await auditModelConfig({ userId: job.userId, configId: job.imageConfigId ?? undefined, kind: "image", action: "generation_completed", outcome: "success", provider: job.provider, model: job.model, runtimePresetId: job.imagePresetId, requestId: job.requestId }).catch(() => undefined);
  } catch (error) {
    if (storageKey) await removeImages([storageKey]).catch(() => undefined);
    let code = errorCode(error);
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${job.userId} FOR UPDATE`);
      const state = await tx.select({ status: imageGenerations.status }).from(imageGenerations)
        .where(eq(imageGenerations.id, job.id)).limit(1);
      if (!state[0] || state[0].status === "cancel_requested" || state[0].status === "cancelled") code = "CANCELLED";
      await tx.update(imageGenerations).set({
        status: code === "CANCELLED" ? "cancelled" : "failed",
        errorCode: code === "CANCELLED" ? null : code,
        completedAt: new Date(),
      }).where(and(eq(imageGenerations.id, job.id), inArray(imageGenerations.status, ["running", "cancel_requested"])));
    }).catch(() => undefined);
    logImageError(error, { generationId: job.id, userId: job.userId, provider: job.provider, model: job.model, errorCode: code });
    await auditModelConfig({ userId: job.userId, configId: job.imageConfigId ?? undefined, kind: "image", action: code === "CANCELLED" ? "generation_cancelled" : "generation_failed", outcome: code === "CANCELLED" ? "success" : "failed", provider: job.provider, model: job.model, runtimePresetId: job.imagePresetId, requestId: job.requestId, errorCode: code === "CANCELLED" ? undefined : code }).catch(() => undefined);
  } finally {
    clearInterval(poll);
  }
  return true;
}

export async function imageConfigExists(userId: string) {
  const rows = await getDb().select({ userId: userImageConfigs.userId }).from(userImageConfigs).where(eq(userImageConfigs.userId, userId)).limit(1);
  return Boolean(rows[0]);
}
