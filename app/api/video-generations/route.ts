import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import { videoGenerationSchema } from "@/lib/validators";
import { enqueueVideoGeneration } from "@/lib/video-generation";
export const runtime = "nodejs";
export async function POST(request: Request) { try { assertSameOrigin(request); const user = await requireUser(); const input = videoGenerationSchema.parse(await request.json()); return NextResponse.json({ generation: await enqueueVideoGeneration(user.id, input) }, { status: 202 }); } catch (error) { return routeError(error); } }
