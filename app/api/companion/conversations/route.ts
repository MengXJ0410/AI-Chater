import { NextResponse } from "next/server";
import { requireCompanionRuntime } from "@/lib/companion-auth";
import { createCompanionConversation, listCompanionConversations } from "@/lib/companion";
import { routeError } from "@/lib/api";
import { companionOptions, withCompanionCors } from "@/lib/companion-http";
import { companionConversationSchema } from "@/lib/validators";

export const runtime = "nodejs";

export function OPTIONS(request: Request) { return companionOptions(request); }

export async function GET(request: Request) {
  try {
    const runtime = await requireCompanionRuntime(request);
    return withCompanionCors(NextResponse.json({ conversations: await listCompanionConversations(runtime.userId) }), request);
  } catch (error) {
    return withCompanionCors(routeError(error), request);
  }
}

export async function POST(request: Request) {
  try {
    const runtime = await requireCompanionRuntime(request);
    const input = companionConversationSchema.parse(await request.json());
    return withCompanionCors(NextResponse.json({ conversation: await createCompanionConversation(runtime.userId, input.title) }, { status: 201 }), request);
  } catch (error) {
    return withCompanionCors(routeError(error), request);
  }
}
