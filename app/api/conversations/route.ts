import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { conversationSchema } from "@/shared/validators";
import { createChatConversation, listChatConversations } from "@/server/services/conversations";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listChatConversations(user.id);
    return NextResponse.json({ conversations: items });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { title } = conversationSchema.parse(await request.json());
    const conversation = await createChatConversation(user.id, title);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
