import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireCompanionRuntime } from "@/server/security/companion-auth";
import { companionOptions, withCompanionCors } from "@/server/http/companion-http";
import { getCompanionConversation } from "@/server/services/companion";
import { getDb } from "@/server/db";
import { messages } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";

export const runtime = "nodejs";

export function OPTIONS(request: Request) { return companionOptions(request); }

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const runtime = await requireCompanionRuntime(request);
    const { id } = await context.params;
    const conversation = await getCompanionConversation(runtime.userId, id);
    if (!conversation) throw new RequestError("Companion 会话不存在。", 404);
    const conversationMessages = await getDb().select().from(messages).where(eq(messages.conversationId, conversation.id));
    return withCompanionCors(NextResponse.json({ conversation, messages: conversationMessages }), request);
  } catch (error) {
    return withCompanionCors(routeError(error), request);
  }
}
