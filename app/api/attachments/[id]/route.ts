import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { getUserAttachment, readMedia } from "@/server/services/uploads";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const attachment = await getUserAttachment(user.id, id);
    const content = await readMedia(attachment.storageKey);
    return new Response(content, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
