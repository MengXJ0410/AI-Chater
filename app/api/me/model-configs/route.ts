import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { assertSameOrigin } from "@/server/http/errors";
import { auditModelConfig, consumeRateLimit } from "@/server/services/model-controls";
import { createModelConfig, listModelConfigs } from "@/server/services/model-configs";
import { modelConfigCreateSchema } from "@/shared/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ configs: await listModelConfigs(user.id) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  let userId = "";
  let input: ReturnType<typeof modelConfigCreateSchema.parse> | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    userId = user.id;
    input = modelConfigCreateSchema.parse(await request.json());
    await consumeRateLimit(user.id, "config_mutation");
    return NextResponse.json({ config: await createModelConfig(user.id, input) }, { status: 201 });
  } catch (error) {
    if (userId && error instanceof Error && "status" in error && Number(error.status) === 429) {
      await auditModelConfig({ userId, kind: input?.kind ?? "chat", action: "rate_limited", outcome: "rejected", errorCode: "RATE_LIMITED" }).catch(() => undefined);
    }
    return routeError(error);
  }
}
