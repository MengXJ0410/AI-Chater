import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireCompanionRuntime } from "@/lib/companion-auth";
import { companionOptions, withCompanionCors } from "@/lib/companion-http";
import { getCompanionConversation } from "@/lib/companion";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { RequestError } from "@/lib/http";

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
