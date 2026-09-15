import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { assertSameOrigin } from "@/server/http/errors";
import { agentRunSchema } from "@/shared/validators";
import { streamAgentReply } from "@/server/services/agent-chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { conversationId, presetId, text } = agentRunSchema.parse(await request.json());
    return await streamAgentReply({ userId: user.id, conversationId, presetId, text }, request.signal);
  } catch (error) {
    return routeError(error);
  }
}
