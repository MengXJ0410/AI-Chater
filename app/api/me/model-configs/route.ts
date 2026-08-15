import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import { auditModelConfig, consumeRateLimit } from "@/lib/model-controls";
import { createModelConfig, listModelConfigs } from "@/lib/model-configs";
import { modelConfigCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() { try { const user = await requireUser(); return NextResponse.json({ configs: await listModelConfigs(user.id) }); } catch (error) { return routeError(error); } }

export async function POST(request: Request) {
  let userId = ""; let input: ReturnType<typeof modelConfigCreateSchema.parse> | undefined;
  try {
    assertSameOrigin(request); const user = await requireUser(); userId = user.id; input = modelConfigCreateSchema.parse(await request.json());
    await consumeRateLimit(user.id, "config_mutation");
    return NextResponse.json({ config: await createModelConfig(user.id, input) }, { status: 201 });
  } catch (error) {
    if (userId && error instanceof Error && "status" in error && Number(error.status) === 429) await auditModelConfig({ userId, kind: input?.kind ?? "chat", action: "rate_limited", outcome: "rejected", errorCode: "RATE_LIMITED" }).catch(() => undefined);
    return routeError(error);
  }
}
