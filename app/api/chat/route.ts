import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { chatSchema } from "@/shared/validators";
import { streamChatReply } from "@/server/services/chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { conversationId, presetId, text, attachmentIds } = chatSchema.parse(await request.json());
    return await streamChatReply({ userId: user.id, conversationId, presetId, text, attachmentIds }, request.signal);
  } catch (error) {
    return routeError(error);
  }
}
