import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import { auditModelConfig, consumeRateLimit } from "@/lib/model-controls";
import { deleteModelConfig, updateModelConfig } from "@/lib/model-configs";
import { modelConfigUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  let userId = ""; let kind: "chat" | "image" = "chat";
  try { assertSameOrigin(request); const user = await requireUser(); userId = user.id; const { id } = await context.params; const input = modelConfigUpdateSchema.parse(await request.json()); kind = input.kind; await consumeRateLimit(user.id, "config_mutation"); return NextResponse.json({ config: await updateModelConfig(user.id, id, input) }); }
  catch (error) { if (userId && error instanceof Error && "status" in error && Number(error.status) === 429) await auditModelConfig({ userId, kind, action: "rate_limited", outcome: "rejected", errorCode: "RATE_LIMITED" }).catch(() => undefined); return routeError(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  let userId = "";
  try { assertSameOrigin(request); const user = await requireUser(); userId = user.id; const { id } = await context.params; await consumeRateLimit(user.id, "config_mutation"); await deleteModelConfig(user.id, id); return NextResponse.json({ ok: true }); }
  catch (error) { if (userId && error instanceof Error && "status" in error && Number(error.status) === 429) await auditModelConfig({ userId, kind: "chat", action: "rate_limited", outcome: "rejected", errorCode: "RATE_LIMITED" }).catch(() => undefined); return routeError(error); }
}
