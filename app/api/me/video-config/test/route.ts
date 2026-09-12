import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import { resolveVideoConfig } from "@/lib/video-config";
import { testComfy } from "@/lib/comfyui";
export async function POST(request: Request) { try { assertSameOrigin(request); const user = await requireUser(); const config = await resolveVideoConfig(user.id); await testComfy(config); return NextResponse.json({ ok: true }); } catch (error) { return routeError(error); } }
