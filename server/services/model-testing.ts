import { logImageError, generateConfiguredImage } from "@/server/providers/ai-image";
import { logModelError, testModelConnection } from "@/server/providers/ai";
import { RequestError } from "@/server/http/errors";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { auditModelConfig } from "@/server/services/model-audit";
import { chatConnectionForPreset, imageConnectionForPreset } from "@/server/services/model-configs";
import { removeImages, saveGeneratedPng } from "@/server/services/uploads";

export type SavedModelTestResult = {
  model: string;
  chargedImageGenerated?: boolean;
};

export async function testSavedModelConfig(userId: string, id: string): Promise<SavedModelTestResult> {
  let kind: "chat" | "image" = "chat";
  let storageKey: string | undefined;
  try {
    const chat = await chatConnectionForPreset(userId, `user-chat-config:${id}`);
    if (chat) {
      await consumeRateLimit(userId, "chat_test");
      await testModelConnection(chat.connection, AbortSignal.timeout(20_000));
      await auditModelConfig({ userId, configId: id, kind: "chat", action: "tested", outcome: "success", provider: chat.config.provider, model: chat.config.model, runtimePresetId: chat.config.runtimePresetId });
      return { model: chat.connection.model };
    }

    kind = "image";
    const image = await imageConnectionForPreset(userId, `user-image-config:${id}`);
    if (!image) throw new RequestError("配置不存在。", 404);
    await consumeRateLimit(userId, "image_test");
    const result = await generateConfiguredImage(image.connection, { prompt: "A simple blue circle on a white background.", aspectRatio: "1:1", resolution: "1k", quality: "low" }, AbortSignal.timeout(120_000));
    const saved = await saveGeneratedPng(result.bytes);
    storageKey = saved.storageKey;
    await removeImages([storageKey]);
    storageKey = undefined;
    await auditModelConfig({ userId, configId: id, kind: "image", action: "tested", outcome: "success", provider: image.config.provider, model: image.config.model, runtimePresetId: image.config.runtimePresetId });
    return { model: image.connection.model, chargedImageGenerated: true };
  } catch (error) {
    if (storageKey) await removeImages([storageKey]).catch(() => undefined);
    if (error instanceof RequestError && error.status === 429) {
      await auditModelConfig({ userId, kind, action: "rate_limited", outcome: "rejected", errorCode: "RATE_LIMITED" }).catch(() => undefined);
    }
    if (error instanceof RequestError) throw error;
    if (error instanceof Error) {
      logModelError(error);
      logImageError(error, { operation: "saved-config-test" });
    }
    await auditModelConfig({ userId, kind, action: "tested", outcome: "failed", errorCode: "TEST_FAILED" }).catch(() => undefined);
    throw new RequestError("连接测试失败，请检查配置。", 502);
  }
}
