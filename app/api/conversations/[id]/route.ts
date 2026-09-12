import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { attachments, conversations, messages } from "@/lib/db/schema";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { renameConversationSchema } from "@/lib/validators";
import { removeImages } from "@/lib/uploads";

async function getConversation(id: string, userId: string) {
  const item = await getDb().select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId), eq(conversations.kind, "chat"))).limit(1);
  return item[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const conversation = await getConversation(id, user.id);
    if (!conversation) return errorResponse("会话不存在。", 404);

    const conversationMessages = await getDb().select().from(messages)
      .where(eq(messages.conversationId, id));
    const messageIds = conversationMessages.map((message) => message.id);
    const conversationAttachments = messageIds.length
      ? await getDb().select({ id: attachments.id, messageId: attachments.messageId, mimeType: attachments.mimeType, originalName: attachments.originalName })
        .from(attachments).where(inArray(attachments.messageId, messageIds))
      : [];
    return NextResponse.json({ conversation, messages: conversationMessages, attachments: conversationAttachments });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!(await getConversation(id, user.id))) return errorResponse("会话不存在。", 404);
    const { title } = renameConversationSchema.parse(await request.json());
    await getDb().update(conversations).set({ title }).where(eq(conversations.id, id));
    return NextResponse.json({ id, title });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!(await getConversation(id, user.id))) return errorResponse("会话不存在。", 404);
    const fileRows = await getDb().select({ storageKey: attachments.storageKey }).from(attachments)
      .innerJoin(messages, eq(attachments.messageId, messages.id))
      .where(eq(messages.conversationId, id));
    await getDb().delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, user.id)));
    await removeImages(fileRows.map((row) => row.storageKey));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
