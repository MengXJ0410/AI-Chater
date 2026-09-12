import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { assertSameOrigin } from "@/server/http/errors";
import { cancelVideoGeneration, getPublicVideoGeneration } from "@/server/services/video-generation";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireUser(); const row = await getPublicVideoGeneration(user.id, (await context.params).id); if (!row) return NextResponse.json({ error: "视频任务不存在。" }, { status: 404 }); return NextResponse.json({ generation: row }); } catch (error) { return routeError(error); } }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireUser(); return NextResponse.json({ generation: await cancelVideoGeneration(user.id, (await context.params).id) }); } catch (error) { return routeError(error); } }
