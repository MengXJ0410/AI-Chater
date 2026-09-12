import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { errorResponse } from "@/lib/http";
import { readMedia } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const attachment = await getDb().select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.userId, user.id))).limit(1);
    if (!attachment[0]) return errorResponse("图片不存在。", 404);
    const content = await readMedia(attachment[0].storageKey);
    return new Response(content, {
      headers: {
        "Content-Type": attachment[0].mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
