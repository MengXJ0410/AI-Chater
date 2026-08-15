import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { logImageError, generateConfiguredImage } from "@/lib/ai-image";
import { logModelError, testModelConnection } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import { consumeRateLimit, auditModelConfig } from "@/lib/model-controls";
import { chatConnectionForPreset, imageConnectionForPreset } from "@/lib/model-configs";
import { removeImages, saveGeneratedPng } from "@/lib/uploads";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let storageKey: string | undefined; let userId = ""; let kind: "chat" | "image" = "chat";
  try {
    assertSameOrigin(request); const user = await requireUser(); userId = user.id; const { id } = await context.params;
    const chat = await chatConnectionForPreset(user.id, `user-chat-config:${id}`);
    if (chat) {
      await consumeRateLimit(user.id, "chat_test"); await testModelConnection(chat.connection, AbortSignal.timeout(20_000));
      await auditModelConfig({ userId: user.id, configId: id, kind: "chat", action: "tested", outcome: "success", provider: chat.config.provider, model: chat.config.model, runtimePresetId: chat.config.runtimePresetId });
      return NextResponse.json({ ok: true, model: chat.connection.model });
    }
    kind = "image"; const image = await imageConnectionForPreset(user.id, `user-image-config:${id}`);
    if (!image) throw new RequestError("配置不存在。", 404);
    await consumeRateLimit(user.id, "image_test");
    const result = await generateConfiguredImage(image.connection, { prompt: "A simple blue circle on a white background.", aspectRatio: "1:1", resolution: "1k", quality: "low" }, AbortSignal.timeout(120_000));
    const saved = await saveGeneratedPng(result.bytes); storageKey = saved.storageKey; await removeImages([storageKey]); storageKey = undefined;
    await auditModelConfig({ userId: user.id, configId: id, kind: "image", action: "tested", outcome: "success", provider: image.config.provider, model: image.config.model, runtimePresetId: image.config.runtimePresetId });
    return NextResponse.json({ ok: true, model: image.connection.model, chargedImageGenerated: true });
  } catch (error) {
    if (storageKey) await removeImages([storageKey]).catch(() => undefined);
    if (userId && error instanceof RequestError && error.status === 429) await auditModelConfig({ userId, kind, action: "rate_limited", outcome: "rejected", errorCode: "RATE_LIMITED" }).catch(() => undefined);
    if (error instanceof RequestError) return routeError(error);
    if (error instanceof Error) { logModelError(error); logImageError(error, { operation: "saved-config-test" }); }
    if (userId) await auditModelConfig({ userId, kind, action: "tested", outcome: "failed", errorCode: "TEST_FAILED" }).catch(() => undefined);
    return errorResponse("连接测试失败，请检查配置。", 502);
  }
}
