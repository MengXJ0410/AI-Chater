import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import { videoConfigSchema } from "@/lib/validators";
import { deleteVideoConfig, getVideoConfig, saveVideoConfig } from "@/lib/video-config";
export const runtime = "nodejs";
export async function GET() { try { const user = await requireUser(); return NextResponse.json({ config: await getVideoConfig(user.id) }); } catch (error) { return routeError(error); } }
export async function PUT(request: Request) { try { assertSameOrigin(request); const user = await requireUser(); return NextResponse.json({ config: await saveVideoConfig(user.id, videoConfigSchema.parse(await request.json())) }); } catch (error) { return routeError(error); } }
export async function DELETE(request: Request) { try { assertSameOrigin(request); const user = await requireUser(); await deleteVideoConfig(user.id); return NextResponse.json({ ok: true }); } catch (error) { return routeError(error); } }
