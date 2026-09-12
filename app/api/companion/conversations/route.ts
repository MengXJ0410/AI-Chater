import { NextResponse } from "next/server";
import { requireCompanionRuntime } from "@/server/security/companion-auth";
import { createCompanionConversation, listCompanionConversations } from "@/server/services/companion";
import { routeError } from "@/server/http/route-error";
import { companionOptions, withCompanionCors } from "@/server/http/companion-http";
import { companionConversationSchema } from "@/shared/validators";

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
