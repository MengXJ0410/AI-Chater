import { randomUUID } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/server/security/auth";

const integration = process.env.AUTH_TEST_DATABASE_URL ? it : it.skip;

describe("MySQL image generation (optional integration)", () => {
  integration("isolates encrypted config and preserves idempotent cancellable generation state", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalSingleKey = process.env.AI_CONFIG_ENCRYPTION_KEY;
    const originalKeys = process.env.AI_CONFIG_ENCRYPTION_KEYS;
    const originalActiveKeyId = process.env.AI_CONFIG_ACTIVE_KEY_ID;
    const originalAllowedUrls = process.env.USER_AI_ALLOWED_BASE_URLS;
    const originalUploadDir = process.env.UPLOAD_DIR;
    const uploadDirectory = await mkdtemp(path.join(tmpdir(), "ai-chater-image-integration-"));
    const firstKey = Buffer.alloc(32, 3).toString("base64");
    const secondKey = Buffer.alloc(32, 4).toString("base64");
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    delete process.env.AI_CONFIG_ENCRYPTION_KEY;
    process.env.AI_CONFIG_ENCRYPTION_KEYS = JSON.stringify({ v1: firstKey });
    process.env.AI_CONFIG_ACTIVE_KEY_ID = "v1";
    process.env.USER_AI_ALLOWED_BASE_URLS = JSON.stringify(["http://127.0.0.1:11434/v1"]);
    process.env.UPLOAD_DIR = uploadDirectory;

    const [{ getDb }, schema, imageConfig, generation, uploads] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/services/image-config"),
      import("@/server/services/image-generation"),
      import("@/server/services/uploads"),
    ]);
    const db = getDb();
    const userA = { id: randomUUID(), username: `image_a_${randomUUID().slice(0, 8)}`, passwordHash: await hashPassword("password123") };
    const userB = { id: randomUUID(), username: `image_b_${randomUUID().slice(0, 8)}`, passwordHash: await hashPassword("password123") };
    const conversationA = { id: randomUUID(), userId: userA.id, title: "新对话" };
    const baseConfig = {
      name: "本地图片模型",
      provider: "openai-compatible" as const,
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "image-model",
      apiKey: "integration-secret-1234",
    };
    const generationInput = {
      requestId: randomUUID(),
      conversationId: conversationA.id,
      imagePresetId: "user-image-config" as const,
      prompt: "draw a blue square",
      referenceAttachmentIds: [],
      aspectRatio: "1:1" as const,
      resolution: "1k" as const,
      quality: "high" as const,
      source: "image-mode" as const,
    };

    try {
      await db.insert(schema.users).values([userA, userB]);
      await db.insert(schema.conversations).values(conversationA);
      await imageConfig.saveImageConfig(userA.id, baseConfig);
      expect(await imageConfig.getPublicImageConfig(userB.id)).toBeNull();
      const encrypted = await db.select().from(schema.userImageConfigs).where(eq(schema.userImageConfigs.userId, userA.id)).limit(1);
      expect(encrypted[0].apiKeyCiphertext).not.toContain(baseConfig.apiKey);
      expect(JSON.stringify(await imageConfig.getPublicImageConfig(userA.id))).not.toContain(baseConfig.apiKey);

      process.env.AI_CONFIG_ENCRYPTION_KEYS = JSON.stringify({ v1: firstKey, v2: secondKey });
      process.env.AI_CONFIG_ACTIVE_KEY_ID = "v2";
      await expect(imageConfig.resolveImageConnection(userA.id)).resolves.toMatchObject({ apiKey: baseConfig.apiKey });
      const rotated = await db.select({ keyId: schema.userImageConfigs.encryptionKeyId }).from(schema.userImageConfigs)
        .where(eq(schema.userImageConfigs.userId, userA.id)).limit(1);
      expect(rotated).toEqual([{ keyId: "v2" }]);

      const first = await generation.enqueueImageGeneration(userA.id, generationInput);
      const duplicate = await generation.enqueueImageGeneration(userA.id, generationInput);
      expect(duplicate?.id).toBe(first?.id);
      const userMessages = await db.select({ id: schema.messages.id }).from(schema.messages)
        .where(and(eq(schema.messages.conversationId, conversationA.id), eq(schema.messages.role, "user")));
      expect(userMessages).toHaveLength(1);
      await expect(generation.enqueueImageGeneration(userA.id, { ...generationInput, prompt: "different request" }))
        .rejects.toMatchObject({ status: 409 });
      await expect(generation.publicGeneration(userB.id, first!.id)).resolves.toBeNull();
      await expect(generation.cancelImageGeneration(userB.id, first!.id)).rejects.toMatchObject({ status: 404 });

      await imageConfig.saveImageConfig(userA.id, { ...baseConfig, name: "更新后的图片模型", apiKey: undefined });
      await expect(generation.publicGeneration(userA.id, first!.id)).resolves.toMatchObject({ status: "cancelled" });

      const completedInput = { ...generationInput, requestId: randomUUID(), prompt: "complete this image" };
      const completed = await generation.enqueueImageGeneration(userA.id, completedInput);
      const providerPng = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#336699" } }).png().toBuffer();
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: providerPng.toString("base64") }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })));
      await expect(generation.processNextImageGeneration()).resolves.toBe(true);
      const completedPublic = await generation.publicGeneration(userA.id, completed!.id);
      expect(completedPublic).toMatchObject({
        status: "completed",
        attachments: [{ mimeType: "image/png", width: 32, height: 32 }],
      });
      await expect(generation.publicGeneration(userB.id, completed!.id)).resolves.toBeNull();
      const generatedAttachment = await db.select({
        id: schema.attachments.id,
        width: schema.attachments.width,
        height: schema.attachments.height,
      }).from(schema.attachments).where(eq(schema.attachments.generationId, completed!.id)).limit(1);
      expect(generatedAttachment).toMatchObject([{ width: 32, height: 32 }]);
      await db.update(schema.attachments).set({ width: null, height: null })
        .where(eq(schema.attachments.id, generatedAttachment[0].id));
      const historical = await generation.publicGeneration(userA.id, completed!.id);
      expect(historical?.attachments[0]).not.toHaveProperty("width");
      expect(historical?.attachments[0]).not.toHaveProperty("height");

      const cancellableInput = { ...generationInput, requestId: randomUUID(), prompt: "cancel this image" };
      const cancellable = await generation.enqueueImageGeneration(userA.id, cancellableInput);
      vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })));
      const processing = generation.processNextImageGeneration();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const state = await generation.publicGeneration(userA.id, cancellable!.id);
        if (state?.status === "running") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await generation.cancelImageGeneration(userA.id, cancellable!.id);
      await processing;
      await expect(generation.publicGeneration(userA.id, cancellable!.id)).resolves.toMatchObject({ status: "cancelled" });

      const queuedForDelete = await generation.enqueueImageGeneration(userA.id, { ...generationInput, requestId: randomUUID(), prompt: "delete config" });
      await imageConfig.deleteImageConfig(userA.id);
      await expect(imageConfig.getPublicImageConfig(userA.id)).resolves.toBeNull();
      await expect(generation.publicGeneration(userA.id, queuedForDelete!.id)).resolves.toMatchObject({ status: "cancelled" });

      const storedFiles = await db.select({ storageKey: schema.attachments.storageKey }).from(schema.attachments)
        .where(eq(schema.attachments.userId, userA.id));
      await uploads.removeImages(storedFiles.map((file) => file.storageKey));
    } finally {
      vi.unstubAllGlobals();
      await db.delete(schema.users).where(inArray(schema.users.id, [userA.id, userB.id]));
      await rm(uploadDirectory, { recursive: true, force: true });
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalSingleKey === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEY;
      else process.env.AI_CONFIG_ENCRYPTION_KEY = originalSingleKey;
      if (originalKeys === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEYS;
      else process.env.AI_CONFIG_ENCRYPTION_KEYS = originalKeys;
      if (originalActiveKeyId === undefined) delete process.env.AI_CONFIG_ACTIVE_KEY_ID;
      else process.env.AI_CONFIG_ACTIVE_KEY_ID = originalActiveKeyId;
      if (originalAllowedUrls === undefined) delete process.env.USER_AI_ALLOWED_BASE_URLS;
      else process.env.USER_AI_ALLOWED_BASE_URLS = originalAllowedUrls;
      if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
      else process.env.UPLOAD_DIR = originalUploadDir;
    }
  }, 30_000);
});
