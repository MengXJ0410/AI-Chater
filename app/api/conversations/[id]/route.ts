import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { renameConversationSchema } from "@/shared/validators";
import { deleteChatConversation, getChatConversationDetail, renameChatConversation } from "@/server/services/conversations";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const detail = await getChatConversationDetail(user.id, id);
    return NextResponse.json(detail);
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const { title } = renameConversationSchema.parse(await request.json());
    const result = await renameChatConversation(user.id, id, title);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    await deleteChatConversation(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
