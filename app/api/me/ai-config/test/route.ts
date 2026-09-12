import { NextResponse } from "next/server";
import { testModelConnection, logModelError } from "@/server/providers/ai";
import { requireUser, UnauthorizedError } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin, errorResponse, RequestError } from "@/server/http/errors";
import { resolveUserAiModelConfig } from "@/server/services/user-ai-config";
import { userAiConfigSchema } from "@/shared/validators";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = userAiConfigSchema.parse(await request.json());
    const connection = await resolveUserAiModelConfig(user.id, input);
    await testModelConnection(connection, AbortSignal.timeout(20_000));
    return NextResponse.json({ ok: true, model: connection.model });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ZodError || error instanceof RequestError) return routeError(error);
    logModelError(error);
    return errorResponse("连接测试失败，请检查 API Key、Base URL 和 Model。", 502);
  }
}
