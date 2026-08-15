import { createHash, randomUUID } from "crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { generateConfiguredImage, logImageError } from "@/lib/ai-image";
import { isDuplicateEntryError } from "@/lib/account";
import { getDb } from "@/lib/db";
import { attachments, conversations, imageGenerations, messages, userImageConfigs } from "@/lib/db/schema";
import { getPublicImageConfig, resolveImageConnection, USER_IMAGE_PRESET_ID } from "@/lib/image-config";
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
    ? await getDb().select({ id: attachments.id, mimeType: attachments.mimeType, size: attachments.size })
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
    attachments: files.map((file) => ({ ...file, url: `/api/attachments/${file.id}` })),
  };
}

export async function enqueueImageGeneration(userId: string, input: GenerationInput) {
  const conversation = await getDb().select({ id: conversations.id, title: conversations.title }).from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, userId))).limit(1);
  if (!conversation[0]) throw new RequestError("会话不存在。", 404);
  const config = await getPublicImageConfig(userId);
  if (!config) throw new RequestError("请先配置图片模型。", 404);
  if (input.imagePresetId !== USER_IMAGE_PRESET_ID) throw new RequestError("图片预设不存在。", 404);
  if (config.provider === "openai-compatible" && (input.resolution !== "1k" || input.quality !== "high")) {
    throw new RequestError("OpenAI Compatible 图片连接仅接受默认分辨率和质量。", 400);
  }

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
    await getDb().transaction(async (tx) => {
      await tx.insert(messages).values({
        id: userMessageId,
        conversationId: input.conversationId,
        role: "user",
        parts: [{ type: "text", text: input.prompt }],
        presetId: USER_IMAGE_PRESET_ID,
        model: config.model,
      });
      await tx.insert(imageGenerations).values({
        id: generationId,
        requestId: input.requestId,
        requestHash: hash,
        userId,
        conversationId: input.conversationId,
        userMessageId,
        imagePresetId: USER_IMAGE_PRESET_ID,
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
    });
  } catch (error) {
    if (!isDuplicateEntryError(error)) throw error;
    const duplicate = await getDb().select().from(imageGenerations)
      .where(and(eq(imageGenerations.userId, userId), eq(imageGenerations.requestId, input.requestId))).limit(1);
    if (!duplicate[0] || duplicate[0].requestHash !== hash) throw new RequestError("requestId 已用于其他生图请求。", 409);
    return publicGeneration(userId, duplicate[0].id);
  }
  return publicGeneration(userId, generationId);
}

export async function cancelImageGeneration(userId: string, id: string) {
  const rows = await getDb().select({ status: imageGenerations.status }).from(imageGenerations)
    .where(and(eq(imageGenerations.id, id), eq(imageGenerations.userId, userId))).limit(1);
  if (!rows[0]) throw new RequestError("生图任务不存在。", 404);
  if (rows[0].status === "queued") {
    await getDb().update(imageGenerations).set({ status: "cancelled", completedAt: new Date() })
      .where(and(eq(imageGenerations.id, id), eq(imageGenerations.userId, userId), eq(imageGenerations.status, "queued")));
  } else if (rows[0].status === "running") {
    await getDb().update(imageGenerations).set({ status: "cancel_requested" })
      .where(and(eq(imageGenerations.id, id), eq(imageGenerations.userId, userId), eq(imageGenerations.status, "running")));
  }
  return publicGeneration(userId, id);
}

function errorCode(error: unknown) {
  if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) return error.name === "TimeoutError" ? "UPSTREAM_TIMEOUT" : "CANCELLED";
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
  if (status === 401 || status === 403) return "UPSTREAM_AUTH";
  if (status === 429) return "UPSTREAM_RATE_LIMIT";
  return error instanceof RequestError ? "OUTPUT_INVALID" : "UPSTREAM_FAILED";
}

export async function recoverInterruptedImageGenerations() {
  await getDb().update(imageGenerations).set({ status: "failed", errorCode: "WORKER_INTERRUPTED", completedAt: new Date() })
    .where(inArray(imageGenerations.status, ["running", "cancel_requested"]));
}

export async function processNextImageGeneration() {
  const rows = await getDb().select().from(imageGenerations)
    .where(eq(imageGenerations.status, "queued")).orderBy(asc(imageGenerations.createdAt)).limit(1);
  const job = rows[0];
  if (!job) return false;
  await getDb().update(imageGenerations).set({ status: "running", startedAt: new Date(), errorCode: null })
    .where(and(eq(imageGenerations.id, job.id), eq(imageGenerations.status, "queued")));

  const controller = new AbortController();
  const timeoutSignal = AbortSignal.timeout(120_000);
  const signal = AbortSignal.any([controller.signal, timeoutSignal]);
  const poll = setInterval(() => {
    void getDb().select({ status: imageGenerations.status }).from(imageGenerations).where(eq(imageGenerations.id, job.id)).limit(1)
      .then((state) => {
        if (!state[0] || state[0].status === "cancel_requested") controller.abort(new DOMException("Cancelled", "AbortError"));
      }).catch(() => undefined);
  }, 500);
  let storageKey: string | undefined;
  try {
    const connection = await resolveImageConnection(job.userId);
    const generated = await generateConfiguredImage(connection, {
      prompt: job.prompt,
      aspectRatio: job.aspectRatio,
      resolution: job.resolution,
      quality: job.quality,
    }, signal);
    const saved = await saveGeneratedPng(generated.bytes);
    storageKey = saved.storageKey;
    const latest = await getDb().select({ status: imageGenerations.status }).from(imageGenerations).where(eq(imageGenerations.id, job.id)).limit(1);
    if (!latest[0] || latest[0].status === "cancel_requested") throw new DOMException("Cancelled", "AbortError");

    const assistantMessageId = randomUUID();
    const attachmentId = randomUUID();
    await getDb().transaction(async (tx) => {
      await tx.insert(messages).values({
        id: assistantMessageId,
        conversationId: job.conversationId,
        role: "assistant",
        parts: [{ type: "image", attachmentId }],
        presetId: USER_IMAGE_PRESET_ID,
        model: connection.model,
      });
      await tx.insert(attachments).values({
        id: attachmentId,
        userId: job.userId,
        messageId: assistantMessageId,
        storageKey: saved.storageKey,
        mimeType: saved.mimeType,
        size: saved.size,
        originalName: `generated-${job.id}.png`,
        generationId: job.id,
        origin: "generated",
      });
      await tx.update(imageGenerations).set({ status: "completed", assistantMessageId, completedAt: new Date(), errorCode: null })
        .where(eq(imageGenerations.id, job.id));
      await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, job.conversationId));
    });
    storageKey = undefined;
  } catch (error) {
    if (storageKey) await removeImages([storageKey]).catch(() => undefined);
    const code = errorCode(error);
    logImageError(error, { generationId: job.id, userId: job.userId, provider: job.provider, model: job.model, errorCode: code });
    await getDb().update(imageGenerations).set({
      status: code === "CANCELLED" ? "cancelled" : "failed",
      errorCode: code === "CANCELLED" ? null : code,
      completedAt: new Date(),
    }).where(eq(imageGenerations.id, job.id)).catch(() => undefined);
  } finally {
    clearInterval(poll);
  }
  return true;
}

export async function imageConfigExists(userId: string) {
  const rows = await getDb().select({ userId: userImageConfigs.userId }).from(userImageConfigs).where(eq(userImageConfigs.userId, userId)).limit(1);
  return Boolean(rows[0]);
}
